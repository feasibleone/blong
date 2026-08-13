import {test} from 'tap';
import {mergeWithSymbols, withProgress} from './index.ts';

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

    t.end();
});
