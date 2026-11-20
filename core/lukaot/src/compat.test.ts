/**
 * A package that still calls a level keeps working, and every such call is named and listed.
 */

import {test} from 'tap';

import {createCompatLog} from './compat.ts';
import {declare} from './declare.ts';
import type {ISignalRecord} from './emit.ts';
import {createRegistry} from './registry.ts';

function collect(): {records: ISignalRecord[]; write: (record: ISignalRecord) => void} {
    const records: ISignalRecord[] = [];
    return {records, write: record => records.push(record)};
}

const registry = () => createRegistry(declare({log: {realSignal: {message: 'declared by hand'}}}));

test('one sentence from one namespace declares one signal', async t => {
    const {records, write} = collect();
    const compat = createCompatLog({registry: registry(), write});
    const log = compat.logger('info', {name: 'chat'});
    log.warn?.({}, 'cannot verify the token');
    log.warn?.({}, 'cannot verify the token');
    t.equal(compat.legacy().length, 1, 'two calls, one declaration');
    t.equal(compat.legacy()[0]?.id, 'legacyChatCannotVerifyTheToken');
    t.equal(compat.legacy()[0]?.package, 'chat');
    t.equal(compat.legacy()[0]?.calls, 2);
    t.same(
        records.map(record => record.signal),
        ['legacyChatCannotVerifyTheToken', 'legacyChatCannotVerifyTheToken'],
    );
    t.end();
});

test('a different sentence is a different signal, even under one namespace', async t => {
    const {write} = collect();
    const compat = createCompatLog({registry: registry(), write});
    const log = compat.logger('warn', {name: 'chat'});
    log.warn?.({}, 'cannot verify the token');
    log.warn?.({}, 'cannot reach slack');
    t.same(
        compat.legacy().map(entry => entry.id),
        ['legacyChatCannotVerifyTheToken', 'legacyChatCannotReachSlack'],
    );
    t.end();
});

test('two sentences that reduce to one identifier are kept apart by a hash', async t => {
    const {write} = collect();
    const compat = createCompatLog({registry: registry(), write});
    const log = compat.logger('info', {name: 'chat'});
    log.info?.({}, 'the channel was created');
    log.info?.({}, 'the channel was closed');
    const ids = compat.legacy().map(entry => entry.id);
    t.equal(ids.length, 2, 'both are declared');
    t.not(ids[0], ids[1], 'and neither shadows the other');
    t.end();
});

test('the framework contract binds downwards from the level asked for', async t => {
    const {write} = collect();
    const compat = createCompatLog({registry: registry(), write});
    const info = compat.logger('info', {name: 'port'});
    t.ok(info.info, 'info is there');
    t.ok(info.fatal, 'and fatal below it');
    t.equal(info.debug, undefined, 'debug is not, so an optional call is a no-op');
    t.equal(info.trace, undefined);
    t.end();
});

test('a legacy signal joins the registry, so policy and counters reach it', async t => {
    const store = registry();
    const {write} = collect();
    const compat = createCompatLog({registry: store, write});
    compat.logger('info', {name: 'chat'}).info?.({}, 'the channel was created');
    const id = compat.legacy()[0]!.id;
    t.ok(store.signal(id), 'the registry knows it');
    t.equal(store.counters(id)?.emitted, 1);
    store.patch({[id]: {level: 'debug'}});
    t.equal(store.policy(id).level, 'debug', 'and an operator can patch it by name');
    t.ok(compat.vocabulary().signal[id], 'the vocabulary reflects it too');
    t.end();
});
