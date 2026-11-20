/**
 * The proxy answers with the caller's file, disappears when the policy says so, and costs nothing
 * for a signal it does not carry.
 */

import {test} from 'tap';

import {declare} from './declare.ts';
import {captureSite, createSignalProxy, type ISite} from './proxy.ts';
import {createRegistry} from './registry.ts';

const registry = createRegistry(
    declare({
        log: {
            agentTicketSkipped: {level: 'warn', message: 'ticket {ticketId} was skipped'},
            agentChatty: {level: 'debug', message: 'chatty {what}'},
        },
        error: {
            agentTicketNotFound: {message: 'Ticket {ticketId} is not in the pool'},
        },
    }),
);

/** The file this test lives in, which is what a captured site has to name. */
const THIS_FILE = 'proxy.test.ts';

test('the caller is the application line, not this package', async t => {
    const seen: Array<ISite | undefined> = [];
    const proxy = createSignalProxy({
        registry,
        emit: (_signal, _params, site) => seen.push(site),
    });
    const skipped = proxy.vocabulary['agentTicketSkipped'];
    skipped?.({ticketId: 't1'});
    skipped?.({ticketId: 't2'});
    t.equal(seen.length, 2);
    t.ok(seen[0]?.file.endsWith(THIS_FILE), `the site names this file, got ${seen[0]?.file}`);
    t.ok(seen[0]?.line, 'the line travels with the file');
    t.same(seen[0], seen[1], 'two calls through one read report one site');
    t.end();
});

test('the dependency map lists the file against the method before anything is emitted', async t => {
    const proxy = createSignalProxy({registry});
    const {agentTicketSkipped} = proxy.vocabulary;
    t.ok(agentTicketSkipped, 'the method is reachable');
    t.same(Object.keys(proxy.dependencies()), [expectFile()], 'the edge is recorded on the read');
    t.same(proxy.dependencies()[expectFile()], ['agentTicketSkipped']);
    t.end();
});

test('a disabled signal is undefined, and costs no capture', async t => {
    registry.patch({agentTicketSkipped: {enabled: false}});
    const proxy = createSignalProxy({registry});
    t.equal(proxy.vocabulary['agentTicketSkipped'], undefined, 'the member is absent');
    t.same(proxy.sites(), {}, 'nothing was captured');
    t.same(proxy.dependencies(), {}, 'and no edge was recorded');
    t.equal(registry.counters('agentTicketSkipped')?.suppressed, 1);
    registry.patch({agentTicketSkipped: {enabled: true}});
    t.end();
});

test('a signal below the threshold is absent, and one above it is not', async t => {
    const proxy = createSignalProxy({registry, threshold: 'info'});
    t.equal(proxy.vocabulary['agentChatty'], undefined, 'debug is below info');
    t.ok(proxy.vocabulary['agentTicketSkipped'], 'warn is above it');
    t.notOk(proxy.reachable('agentChatty'), 'and the policy says so directly');
    t.end();
});

test('an unknown identifier is not on the proxy at all', async t => {
    const proxy = createSignalProxy({registry});
    t.equal(proxy.vocabulary['agentNothingHere'], undefined);
    t.notOk('agentNothingHere' in proxy.vocabulary, 'and `in` agrees');
    t.ok('agentTicketSkipped' in proxy.vocabulary);
    t.end();
});

test('an error signal is never sampled out, because the caller has to throw it', async t => {
    const proxy = createSignalProxy({registry, random: () => 0.99});
    registry.patch({agentTicketNotFound: {sample: 0.001}, agentChatty: {sample: 0.001}});
    t.ok(proxy.vocabulary['agentTicketNotFound'], 'still constructible');
    t.equal(proxy.vocabulary['agentChatty'], undefined, 'a log signal is sampled out');
    t.equal(registry.counters('agentChatty')?.sampledOut, 1);
    registry.patch({agentTicketNotFound: {sample: 1}, agentChatty: {sample: 1}});
    t.end();
});

test('the stack is kept only when it is asked for', async t => {
    const without = captureSite(false);
    const withStack = captureSite(true);
    t.notOk(without?.stack, 'file and line by default');
    t.ok(withStack?.stack?.length, 'the frames when captureStack is on');
    t.end();
});

test('the proxy follows a reload rather than a snapshot', async t => {
    const live = createSignalProxy({registry, threshold: 'trace'});
    t.ok(live.vocabulary['agentChatty']);
    registry.patch({agentChatty: {level: 'trace'}});
    t.ok(live.vocabulary['agentChatty'], 'the level change is read on the next access');
    t.end();
});

/** The file a captured site names, relative to the repository, for the edge assertion. */
function expectFile(): string {
    const site = captureSite(false);
    return site?.file ?? '';
}
