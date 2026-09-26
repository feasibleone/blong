import {test} from 'tap';
import {MAX_PROGRESS_INTERVAL_MS, mergeWithSymbols, withProgress} from './index.ts';

test('deepMerge', t => {
    t.test('merges two flat objects', t => {
        const result = mergeWithSymbols({a: 1, b: 2}, {b: 3, c: 4});
        t.same(result, {a: 1, b: 3, c: 4});
        t.end();
    });

    t.test('merges nested objects recursively', t => {
        const result = mergeWithSymbols({x: {a: 1, b: 2}}, {x: {b: 99, c: 3}});
        t.same(result, {x: {a: 1, b: 99, c: 3}});
        t.end();
    });

    t.test('overwrites arrays (does not merge them)', t => {
        const result = mergeWithSymbols({items: [1, 2]}, {items: [3, 4, 5]});
        t.same(result, {items: [3, 4, 5]});
        t.end();
    });

    t.test('handles multiple sources', t => {
        const result = mergeWithSymbols({a: 1}, {b: 2, c: 3});
        t.same(result, {a: 1, b: 2, c: 3});
        t.end();
    });

    t.test('handles null/undefined source gracefully', t => {
        const result = mergeWithSymbols({a: 1}, undefined as never);
        t.same(result, {a: 1});
        t.end();
    });

    t.test('handles null values in source', t => {
        const result = mergeWithSymbols({a: 1, b: {x: 1}}, {b: null as never});
        t.equal(result.b, null);
        t.end();
    });

    t.end();
});

test('withProgress', t => {
    function makeLog(): {
        log: {info: (...a: unknown[]) => void; warn: (...a: unknown[]) => void};
        calls: Array<{level: 'info' | 'warn'; args: unknown[]}>;
    } {
        const calls: Array<{level: 'info' | 'warn'; args: unknown[]}> = [];
        return {
            log: {
                info: (...args: unknown[]) => calls.push({level: 'info', args}),
                warn: (...args: unknown[]) => calls.push({level: 'warn', args}),
            },
            calls,
        };
    }

    t.test('logs progress for slow operations and resolves with the value', async t => {
        const {log, calls} = makeLog();
        const promise = new Promise<string>(resolve => setTimeout(() => resolve('done'), 80));
        const result = await withProgress(log, 'slow op', promise, {
            getProgress: () => ({done: 1, total: 2}),
            thresholdMs: 5,
            intervalMs: 10,
        });

        t.equal(result, 'done', 'resolves with the underlying value');
        t.ok(calls.length >= 2, 'logged at least a progress line and a completion line');
        t.match(calls[0].args[0] as object, {label: 'slow op'}, 'progress line carries the label');
        t.match(
            calls[0].args[0] as object,
            {progress: {done: 1, total: 2}},
            'progress snapshot is included',
        );
        t.match(
            calls[0].args[1] as string,
            /still running/,
            'progress message mentions "still running"',
        );
        t.equal(calls[0].level, 'warn', 'progress lines log at warn level');
        t.match(calls.at(-1)!.args[1] as string, /completed/, 'final line reports completion');
        t.equal(calls.at(-1)!.level, 'info', 'completion line stays at info level');
        t.end();
    });

    t.test('does not log for fast operations', async t => {
        const {log, calls} = makeLog();
        const result = await withProgress(log, 'fast op', Promise.resolve('ok'), {
            thresholdMs: 10_000,
            intervalMs: 10,
        });

        t.equal(result, 'ok', 'resolves with the value');
        t.same(calls, [], 'no progress lines logged before the threshold');
        t.end();
    });

    t.test('propagates rejections', async t => {
        const {log} = makeLog();
        await t.rejects(
            withProgress(log, 'failing op', Promise.reject(new Error('boom')), {
                thresholdMs: 5,
                intervalMs: 10,
            }),
            /boom/,
            'rejection propagates unchanged',
        );
        t.end();
    });

    t.test('without a logger returns the promise unchanged', async t => {
        const result = await withProgress(undefined, 'op', Promise.resolve('ok'));
        t.equal(result, 'ok');
        t.end();
    });

    t.test('warns when a step finishes past the slow margin', async t => {
        const {log, calls} = makeLog();
        const promise = new Promise<string>(resolve => setTimeout(() => resolve('done'), 60));
        const result = await withProgress(log, 'slow step', promise, {
            getProgress: () => ({done: 1, total: 2}),
            slowMs: 10,
            intervalMs: 10_000,
        });

        t.equal(result, 'done', 'resolves with the underlying value');
        t.equal(calls.length, 1, 'one line: the slow step itself');
        t.equal(calls[0].level, 'warn', 'a step past the margin is a warning');
        t.match(calls[0].args[0] as object, {label: 'slow step'}, 'the line names the step');
        t.match(
            calls[0].args[0] as object,
            {progress: {done: 1, total: 2}},
            'the warning carries the progress snapshot',
        );
        t.match(calls[0].args[1] as string, /took \d+ms/, 'the message reports the elapsed time');
        t.end();
    });

    t.test('a fast step stays silent even when it may warn', async t => {
        const {log, calls} = makeLog();
        await withProgress(log, 'fast step', Promise.resolve('ok'), {
            slowMs: 10_000,
            intervalMs: 10,
        });

        t.same(calls, [], 'nothing is logged below the margin');
        t.end();
    });

    t.test('slowMs of zero disables the warning', async t => {
        const {log, calls} = makeLog();
        await withProgress(log, 'op', new Promise(resolve => setTimeout(() => resolve('ok'), 30)), {
            slowMs: 0,
            thresholdMs: 10_000,
            intervalMs: 10,
        });

        t.same(calls, [], 'no warning when the margin is disabled');
        t.end();
    });

    t.test('reports a slow step less often as it goes on', async t => {
        const {log, calls} = makeLog();
        const promise = new Promise<string>(resolve => setTimeout(() => resolve('done'), 250));
        await withProgress(log, 'long step', promise, {
            thresholdMs: 5,
            intervalMs: 10,
            slowMs: 10_000,
        });

        const reported = calls
            .filter(call => /still running/.test(call.args[1] as string))
            .map(call => (call.args[0] as {elapsedMs: number}).elapsedMs);
        // A fixed 10 ms cadence would report about twenty-five times in this
        // window; the gaps double instead, so the log gets a handful of lines.
        t.ok(reported.length >= 3, 'a step is reported more than once');
        t.ok(reported.length <= 8, 'but the reports thin out instead of filling the log');

        const gaps = reported.slice(1).map((at, index) => at - reported[index]);
        t.ok(
            gaps.every((gap, index) => index === 0 || gap >= gaps[index - 1]),
            'each gap is at least as long as the one before it',
        );
        t.ok((gaps[gaps.length - 1] ?? 0) >= 4 * (gaps[0] ?? 1), 'and it has doubled its way up');
        t.ok(
            gaps.every(gap => gap <= MAX_PROGRESS_INTERVAL_MS),
            'no gap exceeds the ceiling, whatever the step does',
        );
        t.equal(MAX_PROGRESS_INTERVAL_MS, 300_000, 'the ceiling is five minutes');
        t.end();
    });

    t.end();
});
