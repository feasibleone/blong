/**
 * A vocabulary declared in code is the same vocabulary as the one in a layer file.
 */

import {test} from 'tap';

import {compose, declare} from './declare.ts';
import {createSignalProxy} from './proxy.ts';
import {createRegistry} from './registry.ts';

test('two declarations compose into one vocabulary, and the proxy sees both', async t => {
    const declared = declare({
        log: {
            agentTicketSkipped: {level: 'warn', message: 'ticket {ticketId} was skipped'},
        },
    });
    const fromCode = declare({
        error: {agentTicketNotFound: 'Ticket {ticketId} is not in the pool'},
    });
    const vocabulary = compose(declared, fromCode);
    t.same(Object.keys(vocabulary.signal), ['agentTicketSkipped', 'agentTicketNotFound']);

    const registry = createRegistry(vocabulary);
    registry.patch({agent: {level: 'debug'}});
    const proxy = createSignalProxy({registry});
    t.ok(proxy.vocabulary['agentTicketSkipped'], 'a declared-in-code method is on the proxy');
    t.equal(registry.policy('agentTicketNotFound').level, 'debug', 'and follows the same policy');
    t.end();
});

test('a duplicate across two declarations names both sites', async t => {
    const first = declare({log: {agentBusy: 'nothing to do'}});
    const second = declare({log: {agentBusy: 'still nothing'}});
    let message = '';
    try {
        compose(first, second);
    } catch (error) {
        message = (error as Error).message;
    }
    t.match(message, /"agentBusy" is declared twice/, 'the identifier is named');
    t.match(message, /compose\.test\.ts:\d+/, 'the first site carries its line');
    t.equal(message.match(/compose\.test\.ts:\d+/g)?.length, 2, 'and both sites are named');
    t.end();
});

test('the site of a declaration is the file that wrote it', async t => {
    const declared = declare({log: {agentBusy: 'nothing to do'}});
    t.ok(declared.origin?.file.endsWith('compose.test.ts'), `got ${declared.origin?.file}`);
    t.end();
});
