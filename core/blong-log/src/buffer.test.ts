/**
 * Tests for the circular buffer.
 */

import {test} from 'tap';
import {CircularBuffer} from './buffer.js';

test('CircularBuffer', async t => {
    t.test('add and retrieve entries', async t => {
        const buffer = new CircularBuffer(100);

        buffer.add({level: 30, msg: 'hello', name: 'test'});
        buffer.add({level: 40, msg: 'warning', name: 'test'});
        buffer.add({level: 50, msg: 'error', name: 'other'});

        t.equal(buffer.size, 3);

        const recent = buffer.getRecent();
        t.equal(recent.length, 3);
        t.equal(recent[0].msg, 'hello');
        t.equal(recent[1].msg, 'warning');
        t.equal(recent[2].msg, 'error');
    });

    t.test('entries have ULIDs', async t => {
        const buffer = new CircularBuffer(100);

        const entry1 = buffer.add({msg: 'first'});
        const entry2 = buffer.add({msg: 'second'});

        t.ok(entry1.id);
        t.ok(entry2.id);
        t.ok(entry1.id < entry2.id, 'ULIDs should be monotonically increasing');
    });

    t.test('circular behavior - overwrites oldest entries', async t => {
        const buffer = new CircularBuffer(3);

        buffer.add({msg: 'a'});
        buffer.add({msg: 'b'});
        buffer.add({msg: 'c'});
        buffer.add({msg: 'd'});

        t.equal(buffer.size, 3);

        const recent = buffer.getRecent();
        t.equal(recent.length, 3);
        t.equal(recent[0].msg, 'b');
        t.equal(recent[1].msg, 'c');
        t.equal(recent[2].msg, 'd');
    });

    t.test('filter by level', async t => {
        const buffer = new CircularBuffer(100);

        buffer.add({level: 10, msg: 'trace'});
        buffer.add({level: 20, msg: 'debug'});
        buffer.add({level: 30, msg: 'info'});
        buffer.add({level: 40, msg: 'warn'});
        buffer.add({level: 50, msg: 'error'});

        const result = buffer.getRecent({level: 'warn'});
        t.equal(result.length, 2);
        t.equal(result[0].msg, 'warn');
        t.equal(result[1].msg, 'error');
    });

    t.test('filter by name', async t => {
        const buffer = new CircularBuffer(100);

        buffer.add({level: 30, msg: 'one', name: 'gateway'});
        buffer.add({level: 30, msg: 'two', name: 'orchestrator'});
        buffer.add({level: 30, msg: 'three', name: 'gateway'});

        const result = buffer.getRecent({name: 'gate'});
        t.equal(result.length, 2);
        t.equal(result[0].msg, 'one');
        t.equal(result[1].msg, 'three');
    });

    t.test('filter by traceId', async t => {
        const buffer = new CircularBuffer(100);

        buffer.add({msg: 'a', traceId: 'trace-1'});
        buffer.add({msg: 'b', traceId: 'trace-2'});
        buffer.add({msg: 'c', traceId: 'trace-1'});

        const result = buffer.getRecent({traceId: 'trace-1'});
        t.equal(result.length, 2);
        t.equal(result[0].msg, 'a');
        t.equal(result[1].msg, 'c');
    });

    t.test('free text search', async t => {
        const buffer = new CircularBuffer(100);

        buffer.add({msg: 'user login successful', name: 'auth'});
        buffer.add({msg: 'database query executed', name: 'db'});
        buffer.add({msg: 'user logout', name: 'auth'});

        const result = buffer.getRecent({search: 'user'});
        t.equal(result.length, 2);
    });

    t.test('filter with limit', async t => {
        const buffer = new CircularBuffer(100);

        for (let i = 0; i < 20; i++) {
            buffer.add({msg: `entry-${i}`});
        }

        const result = buffer.getRecent({limit: 5});
        t.equal(result.length, 5);
        t.equal(result[0].msg, 'entry-15');
        t.equal(result[4].msg, 'entry-19');
    });

    t.test('filter after ULID', async t => {
        const buffer = new CircularBuffer(100);

        buffer.add({msg: 'first'});
        const second = buffer.add({msg: 'second'});
        buffer.add({msg: 'third'});

        const result = buffer.getRecent({after: second.id});
        t.equal(result.length, 1);
        t.equal(result[0].msg, 'third');
    });

    t.test('level normalization', async t => {
        const buffer = new CircularBuffer(100);

        const entry = buffer.add({level: 30, msg: 'test'});
        t.equal(entry.levelName, 'info');
    });

    t.test('clear buffer', async t => {
        const buffer = new CircularBuffer(100);

        buffer.add({msg: 'test'});
        t.equal(buffer.size, 1);

        buffer.clear();
        t.equal(buffer.size, 0);
        t.equal(buffer.getRecent().length, 0);
    });

    t.test('custom property filter', async t => {
        const buffer = new CircularBuffer(100);

        buffer.add({msg: 'a', env: 'prod'});
        buffer.add({msg: 'b', env: 'dev'});
        buffer.add({msg: 'c', env: 'prod'});

        const result = buffer.getRecent({properties: {env: 'prod'}});
        t.equal(result.length, 2);
    });
});
