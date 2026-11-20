/**
 * The registry answers for one identifier at a time, and a patch applies to the next call.
 */

import {test} from 'tap';

import {declare} from './declare.ts';
import {createRegistry} from './registry.ts';

const vocabulary = declare({
    log: {
        agentTicketSkipped: {level: 'warn', message: 'ticket {ticketId} was skipped'},
        agentTicketClaimed: {level: 'info', message: 'ticket {ticketId} was claimed'},
        dbQueryFailed: {level: 'error', message: 'query failed'},
    },
    error: {
        agentTicketNotFound: {message: 'Ticket {ticketId} is not in the pool', statusCode: 404},
    },
});

test('a declaration resolves to one entry per identifier', async t => {
    const registry = createRegistry(vocabulary);
    t.same(registry.identifiers(), [
        'agentTicketSkipped',
        'agentTicketClaimed',
        'dbQueryFailed',
        'agentTicketNotFound',
    ]);
    t.same(registry.counters('agentTicketSkipped'), {
        reached: 0,
        emitted: 0,
        sampledOut: 0,
        suppressed: 0,
    });
    t.equal(registry.signal('agentTicketNotFound')?.kind, 'error');
    t.end();
});

test('the declared level is the policy until something overrides it', async t => {
    const registry = createRegistry(vocabulary);
    t.same(registry.policy('agentTicketSkipped'), {enabled: true, level: 'warn', sample: 1});
    t.equal(registry.policy('agentTicketNotFound').level, 'error', 'an error records at error');
    t.end();
});

test('a patch applies to the very next call, with no re-declaration', async t => {
    const registry = createRegistry(vocabulary);
    const seen: string[] = [];
    const call = () => {
        seen.push(registry.policy('agentTicketSkipped').level);
    };
    call();
    registry.patch({agentTicketSkipped: {level: 'debug'}});
    call();
    t.same(seen, ['warn', 'debug'], 'the patch is read at call time');
    t.equal(registry.version, 1, 'the version moves so a cached resolution can be invalidated');
    t.end();
});

test('a namespace key covers every identifier it opens, and an exact key wins', async t => {
    const registry = createRegistry(vocabulary);
    registry.patch({agent: {level: 'debug'}, agentTicketSkipped: {level: 'error'}});
    t.equal(
        registry.policy('agentTicketClaimed').level,
        'debug',
        'the namespace reaches its methods',
    );
    t.equal(registry.policy('agentTicketSkipped').level, 'error', 'the exact key wins');
    t.equal(
        registry.policy('agentTicketNotFound').level,
        'debug',
        'an error signal follows it too',
    );
    t.equal(registry.policy('dbQueryFailed').level, 'error', 'another namespace is untouched');
    t.end();
});

test('a namespace and an exact key compose rather than replace', async t => {
    const registry = createRegistry(vocabulary);
    registry.patch({agent: {level: 'debug', sample: 0.5}});
    t.same(registry.policy('agentTicketClaimed'), {enabled: true, level: 'debug', sample: 0.5});
    registry.patch({agentTicketClaimed: {enabled: false}});
    t.same(
        registry.policy('agentTicketClaimed'),
        {enabled: false, level: 'debug', sample: 0.5},
        'the later override keeps what the namespace said',
    );
    t.end();
});

test('an undeclared key is reported, and a bad level is refused', async t => {
    const registry = createRegistry(vocabulary);
    t.same(registry.patch({agentTicketskiped: {level: 'debug'}}), ['agentTicketskiped']);
    t.throws(() => registry.patch({agent: {level: 'loud' as 'info'}}), /not one of/);
    t.end();
});

test('the counters are the report the plan asks for', async t => {
    const registry = createRegistry(vocabulary);
    registry.count('agentTicketSkipped', 'reached');
    registry.count('agentTicketSkipped', 'reached');
    registry.count('agentTicketSkipped', 'sampledOut');
    t.same(registry.counters('agentTicketSkipped'), {
        reached: 2,
        emitted: 0,
        sampledOut: 1,
        suppressed: 0,
    });
    t.equal(registry.counters('nobody'), undefined, 'an undeclared id has no counters');
    t.end();
});
