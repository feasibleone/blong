/**
 * The framework's error contract, against the emitter that now writes it (`@@T-722`).
 *
 * Four promises, each of which a previous implementation made and a rewrite could quietly break:
 *
 * 1. An **expected** error — one `$meta.expect` names — is still demoted: it records at `debug`, because a
 *    caller who asked for it is not reporting a fault.
 * 2. An **unexpected** one records at `error` with the `type` and `statusCode` a gateway answers with, and
 *    with the failure's message and stack in the logger's error slot — the thing that was lost when the
 *    error was handed over as a bag of fields instead (`@@D-907`).
 * 3. The **completion handler** still sees the same object: `error()` answers what it was given, with
 *    `$meta.method` stamped on it, so a caller can still correlate the record with what it throws.
 * 4. A **silent** error records nothing at all — it is control flow, not a fault — and nothing about it
 *    reaches the store either.
 *
 * The method is exercised through the prototype rather than through a constructed adapter: what is under
 * test is `AdapterBase.error()` and the log it writes through, and a full adapter would bring an API, a
 * registry and a queue to a question about one method.
 */

import {test} from 'tap';

import {AdapterBase} from './AdapterBase.ts';
import LukaotLog from './LukaotLog.ts';

/** A collector for what the log writes, and a store that records what is retained. */
function harness() {
    const lines: string[] = [];
    const retained: string[] = [];
    const log = new LukaotLog({
        format: 'json',
        level: 'trace',
        writer: {
            write: (line: string) => {
                lines.push(line);
            },
        },
        cache: {
            put: async (record: {id: string}) => {
                retained.push(record.id);
            },
            putSync: (record: {id: string}) => {
                retained.push(record.id);
            },
            get: async () => undefined,
        } as never,
    });
    const records = (): Array<Record<string, unknown>> =>
        lines
            .join('')
            .split('\n')
            .filter(line => line.trim().startsWith('{'))
            .map(line => JSON.parse(line) as Record<string, unknown>);
    return {log, records, retained};
}

/** The bit of an adapter `error()` needs: a logger face, and nothing else. */
function adapterWith(log: LukaotLog, level: 'info' | 'debug' = 'info') {
    const fake = Object.create(AdapterBase.prototype) as {
        log: unknown;
        error: (error: unknown, meta: unknown) => unknown;
    };
    fake.log = log.logger(level, {name: 'payshield'});
    return fake;
}

/** A typed error, which is an `Error` with the framework's own fields on it. */
const typedError = (overrides: Record<string, unknown> = {}) =>
    Object.assign(new Error('the connection reset'), {
        type: 'adapter.stream',
        statusCode: 503,
        params: {context: {host: 'payshield'}},
        ...overrides,
    });

test('an expected error records at debug where debug is enabled, and not at all where it is not', async t => {
    const quiet = harness();
    adapterWith(quiet.log).error(typedError(), {
        method: 'adapter.pull',
        expect: ['adapter.stream'],
    });
    t.equal(quiet.records().length, 0, 'at info the demotion is filtered, as it always was');

    const {log, records} = harness();
    const adapter = adapterWith(log, 'debug');
    const error = typedError();
    adapter.error(error, {method: 'adapter.pull', expect: ['adapter.stream']});
    const [record] = records();
    t.equal(record?.levelName, 'debug', '$meta.expect demoted it');
    t.equal(record?.msg, 'the connection reset', 'and it still says what happened');
    t.same(
        (record?.fields as Record<string, unknown>)?.type,
        'adapter.stream',
        'the type a reader filters on is on the record',
    );
    t.end();
});

test('an unexpected error records at error with its type, status and stack', async t => {
    const {log, records} = harness();
    const adapter = adapterWith(log);
    adapter.error(typedError(), {method: 'adapter.pull'});
    const [record] = records();
    t.equal(record?.levelName, 'error', 'a fault is a fault');
    t.equal(record?.operation, 'adapter.pull', 'the header names the call that failed');
    const fields = (record?.fields ?? {}) as Record<string, unknown>;
    t.equal(fields.type, 'adapter.stream');
    t.equal(fields.statusCode, 503, 'the status a gateway answers with survives');
    const err = record?.err as {message?: string; stack?: string} | undefined;
    t.equal(err?.message, 'the connection reset', 'and the message is not lost');
    t.ok(String(err?.stack).includes('at '), 'nor the stack');
    t.end();
});

test('the caller gets back the error it handed over, stamped with the method', async t => {
    const {log} = harness();
    const adapter = adapterWith(log);
    const error = typedError();
    const answered = adapter.error(error, {method: 'db.subject.find'}) as {method?: string};
    t.equal(answered, error, 'the same object, so a caller can rethrow what was recorded');
    t.equal(answered.method, 'db.subject.find', '$meta.method is stamped on it');
    t.end();
});

test('a silent error records nothing and retains nothing', async t => {
    const {log, records, retained} = harness();
    const adapter = adapterWith(log);
    adapter.error(typedError({silent: true}), {method: 'adapter.pull'});
    t.equal(records().length, 0, 'no line was written');
    t.equal(retained.length, 0, 'and nothing reached the store');
    t.end();
});
