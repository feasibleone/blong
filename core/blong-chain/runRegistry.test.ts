import {test} from 'tap';
import {TestRunRegistry} from './runRegistry.ts';

test('events carry monotonic cursors and pages are read from a cursor', t => {
    const registry = new TestRunRegistry<{ok: boolean}, {kind: string}>();
    const runId = registry.start('topic', {ok: false});
    t.equal(registry.append(runId, {kind: 'run:start'}), 1, 'the first cursor is 1');
    t.equal(registry.append(runId, {kind: 'step:start'}), 2, 'the cursor increments');
    const first = registry.find(runId, 0);
    t.same(
        first.events.map(entry => entry.event.kind),
        ['run:start', 'step:start'],
        'the first page has both events',
    );
    t.equal(first.done, false, 'a running run is not done');
    const second = registry.find(runId, 1);
    t.same(
        second.events.map(entry => entry.cursor),
        [2],
        'a cursor returns only what follows it',
    );
    registry.end(runId, 'completed', {ok: true});
    t.same(registry.snapshot(runId), {ok: true}, 'the final snapshot is stored');
    t.equal(registry.find(runId, 2).done, true, 'the terminal run is done');
    t.equal(registry.state(runId), 'completed', 'the state is terminal');
    t.end();
});

test('starting a topic cancels the run already active on it', t => {
    const registry = new TestRunRegistry<string, string>();
    const first = registry.start('topic', 'first');
    const second = registry.start('topic', 'second');
    t.equal(registry.state(first), 'cancelled', 'the previous run is cancelled');
    t.equal(registry.state(second), 'running', 'the new run is running');
    t.not(first, second, 'the run ids differ');
    t.end();
});

test('the event list is bounded while cursors keep increasing', t => {
    const registry = new TestRunRegistry<unknown, number>({maxEvents: 2});
    const runId = registry.start('topic', undefined);
    registry.append(runId, 1);
    registry.append(runId, 2);
    registry.append(runId, 3);
    t.same(
        registry.find(runId, 0).events.map(entry => entry.event),
        [2, 3],
        'only the newest events are retained',
    );
    t.equal(registry.append(runId, 4), 4, 'the cursor follows the run, not the array length');
    t.end();
});

test('a stale run is pruned', t => {
    let now = 1_000;
    const registry = new TestRunRegistry<unknown, unknown>({ttlMs: 100, now: () => now});
    const runId = registry.start('topic', undefined);
    registry.end(runId, 'completed');
    now = 1_200;
    registry.prune();
    t.equal(registry.snapshot(runId), undefined, 'the expired run is gone');
    t.throws(() => registry.find(runId), /Unknown test run/, 'reading it reports the miss');
    t.end();
});

test('an unknown run is refused', t => {
    const registry = new TestRunRegistry();
    t.throws(() => registry.append('missing', {}), /Unknown test run/);
    t.throws(() => registry.find('missing'), /Unknown test run/);
    t.end();
});
