/**
 * A reached call becomes one record, and a call the policy skipped becomes nothing at all.
 */

import {test} from 'tap';

import {declare} from './declare.ts';
import {createEmitter, render, type ISignalRecord} from './emit.ts';
import {createSignalProxy} from './proxy.ts';
import {createRegistry} from './registry.ts';

const registry = createRegistry(
    declare({
        log: {
            agentTicketSkipped: {level: 'warn', message: 'ticket {ticketId} was skipped: {reason}'},
            agentChatty: {level: 'debug', message: 'chatty'},
        },
    }),
);

/** A writer that keeps what it is given. */
function collect(): {records: ISignalRecord[]; write: (record: ISignalRecord) => void} {
    const records: ISignalRecord[] = [];
    return {records, write: record => records.push(record)};
}

test('a record carries identity, level, params and site', async t => {
    const {records, write} = collect();
    const proxy = createSignalProxy({
        registry,
        emit: createEmitter({
            registry,
            write,
            now: () => 1700000000000,
            identity: () => ({trace: 't-1'}),
        }),
    });
    proxy.vocabulary['agentTicketSkipped']?.({ticketId: 't1', reason: 'claimed already'});
    const record = records[0]!;
    t.equal(record.signal, 'agentTicketSkipped', 'the identifier is the identity');
    t.equal(record.kind, 'log');
    t.equal(record.level, 'warn');
    t.equal(record.message, 'ticket t1 was skipped: claimed already');
    t.same(record.params, {ticketId: 't1', reason: 'claimed already'});
    t.ok(record.site?.file.endsWith('emit.test.ts'), 'the site is the caller');
    t.same(record.identity, {trace: 't-1'});
    t.equal(record.time, 1700000000000);
    t.end();
});

test('a placeholder the call did not supply is marked, not dropped', async t => {
    t.equal(render('ticket {ticketId} was {verb}', {ticketId: 't1'}), 'ticket t1 was ?verb?');
    t.equal(render('nothing to fill', undefined), 'nothing to fill');
    t.equal(render('a {value}', {value: 0}), 'a 0', 'a falsy value is still a value');
    t.end();
});

test('a sampled-out call never reaches the writer', async t => {
    const {records, write} = collect();
    registry.patch({agentChatty: {sample: 0.001}});
    const proxy = createSignalProxy({
        registry,
        random: () => 0.5,
        emit: createEmitter({registry, write}),
    });
    t.equal(proxy.vocabulary['agentChatty'], undefined, 'the member is absent');
    t.same(records, [], 'the writer was not called');
    t.equal(registry.counters('agentChatty')?.sampledOut, 1, 'but the call was counted as skipped');
    registry.patch({agentChatty: {sample: 1}});
    t.end();
});

test('the emitted counter counts records, not calls', async t => {
    const {records, write} = collect();
    registry.patch({agentChatty: {sample: 1, level: 'trace'}});
    const proxy = createSignalProxy({registry, emit: createEmitter({registry, write})});
    const chatty = proxy.vocabulary['agentChatty'];
    chatty?.();
    chatty?.();
    t.equal(records.length, 2);
    t.equal(registry.counters('agentChatty')?.reached, 2);
    t.equal(registry.counters('agentChatty')?.emitted, 2);
    t.end();
});
