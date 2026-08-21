/**
 * JSON-column interception for the knex adapter.
 *
 * Any column whose name ends with `JSON` is treated as a JSON document stored
 * in a plain string column.  The shared `srv.db` queryBuilder is wrapped so
 * this conversion is automatic for every consumer of the adapter:
 *
 *  - `insert()` / `update()` — plain object/array values for `*JSON` columns
 *    are serialized with `JSON.stringify` before hitting the database.
 *  - query results (`select`, `first`, ...) — string values in `*JSON`
 *    columns are parsed back with `JSON.parse` (lenient: values that are not
 *    valid JSON are left untouched).
 *
 * This lets a realm store structured parameters in a single column without
 * manual (de)serialization — e.g. blong-access stores the credential function
 * and its parameters (`{"function":"hash","algorithm":"pbkdf2",...}`) in
 * `access_credential.credentialParamsJSON`.
 */

import {type IKnexRetryOptions} from './types.ts';

/** Column names ending in `JSON` are treated as JSON documents. */
const JSON_COLUMN = /JSON$/;

/** Whether a column name is a JSON column (ends in `JSON`). */
export function isJsonColumn(column: string): boolean {
    return JSON_COLUMN.test(column);
}

/**
 * Detect a MySQL deadlock error (errno 1213 / `ER_LOCK_DEADLOCK`). Used to log
 * deadlock details — including the offending query — in dev mode.
 */
export function isDeadlock(error: unknown): boolean {
    if (!error || typeof error !== 'object') return false;
    const {code, errno} = error as {code?: unknown; errno?: unknown};
    return code === 'ER_LOCK_DEADLOCK' || errno === 1213;
}

/**
 * Error codes that indicate a *transient* MySQL connection failure worth
 * retrying — the server closed the socket, the pool hit the server's
 * `max_connections`, or the TCP link was reset. `fatal: true` is the generic
 * marker mysql2 sets for errors that invalidate the connection (it is set on
 * `PROTOCOL_CONNECTION_LOST`, the error observed intermittently in CI).
 */
const RETRYABLE_CONNECTION_CODES = new Set([
    'PROTOCOL_CONNECTION_LOST',
    'PROTOCOL_ENQUEUE_AFTER_FATAL_ERROR',
    'ECONNRESET',
    'ETIMEDOUT',
    'ER_CON_COUNT_ERROR', // Too many connections (server max_connections)
    'ER_SERVER_SHUTDOWN', // Server shutting down
    'ER_ABORTING_CONNECTION',
]);

/**
 * Whether a query error is a transient connection failure the adapter may
 * retry. Only connection-level failures qualify — deadlocks, constraint
 * violations and ordinary SQL errors are never retried here.
 */
export function isRetryableConnectionError(error: unknown): boolean {
    if (!error || typeof error !== 'object') return false;
    const {code, fatal} = error as {code?: unknown; fatal?: unknown};
    return fatal === true || (typeof code === 'string' && RETRYABLE_CONNECTION_CODES.has(code));
}

/**
 * Optional hooks and behaviour applied while wrapping the shared knex instance.
 */
export interface WrapKnexOptions {
    /** Invoked when a query rejects with a deadlock error, before the caller's rejection handler. */
    onDeadlock?: (error: unknown) => void;
    /**
     * Invoked when a query rejects with a transient connection error (before the
     * caller's rejection handler). Fired on every failed attempt — including when
     * retry is disabled — so connection drops can be logged for diagnostics.
     */
    onConnectionError?: (error: unknown) => void;
    /**
     * Opt-in retry of transient connection errors. Non-prod only — disabled by
     * default; enable via the `knex.retry` config block (see `srv.db`).
     */
    retry?: IKnexRetryOptions;
}

/**
 * Run `run()` once; if it rejects with a transient connection error and retry
 * is enabled, re-run it (up to `maxRetries`) with linear backoff
 * (`backoffMs * attempt`). Between attempts the knex pool re-establishes a
 * healthy connection, so a query that hit a dead socket usually succeeds on the
 * next attempt. When retry is disabled (default) the query runs exactly once.
 */
export async function withConnectionRetry<T>(
    run: () => Promise<T>,
    options: WrapKnexOptions,
): Promise<T> {
    const retry = options.retry;
    if (!retry?.enabled) return run();
    const maxRetries = retry.maxRetries ?? 3;
    const backoffMs = retry.backoffMs ?? 250;
    let attempt = 0;
    for (;;) {
        try {
            return await run();
        } catch (error) {
            if (!isRetryableConnectionError(error)) throw error;
            if (attempt >= maxRetries) throw error;
            attempt += 1;
            await new Promise(resolve => setTimeout(resolve, backoffMs * attempt));
        }
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Serialize object/array values of `*JSON` columns to JSON strings.
 * Returns a new object; scalar/string values are copied unchanged.
 */
export function stringifyJsonValues(values: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(values)) {
        result[key] =
            JSON_COLUMN.test(key) && (isRecord(value) || Array.isArray(value))
                ? JSON.stringify(value)
                : value;
    }
    return result;
}

/** Parse `*JSON` string values in a single result row.  Mutates and returns the row. */
export function parseJsonRow(row: Record<string, unknown>): Record<string, unknown> {
    for (const [key, value] of Object.entries(row)) {
        if (JSON_COLUMN.test(key) && typeof value === 'string') {
            try {
                row[key] = JSON.parse(value);
            } catch {
                // Not valid JSON — keep the raw string.
            }
        }
    }
    return row;
}

/**
 * Parse `*JSON` columns in a query result.  Handles a single row, an array of
 * rows, and the `[rows, meta]` shape MySQL returns for DML.  Rows are mutated
 * in place; the overall result shape is preserved.
 */
export function parseJsonResult(result: unknown): unknown {
    if (Array.isArray(result)) {
        return result.map(row => (isRecord(row) ? parseJsonRow(row) : row));
    }
    if (isRecord(result)) return parseJsonRow(result);
    return result;
}

/**
 * Wrap a knex QueryBuilder instance so JSON columns are serialized on write and
 * parsed on read.
 *
 * Only `insert`, `update`, and `then` are intercepted — all other builder
 * behaviour is untouched.  Chained calls keep working because knex builder
 * methods return the same instance.  The `then` rejection path is also
 * intercepted to detect MySQL deadlocks and report them via `options.onDeadlock`,
 * and to retry transient connection errors via `options.retry`.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function wrapJsonBuilder(builder: any, options: WrapKnexOptions = {}): any {
    const originalInsert = builder.insert.bind(builder);
    builder.insert = (...args: unknown[]) => {
        const [first, ...rest] = args;
        if (isRecord(first)) return originalInsert(stringifyJsonValues(first), ...rest);
        if (Array.isArray(first))
            return originalInsert(
                first.map(row => (isRecord(row) ? stringifyJsonValues(row) : row)),
                ...rest,
            );
        return originalInsert(...args);
    };

    const originalUpdate = builder.update.bind(builder);
    builder.update = (...args: unknown[]) => {
        const [first, ...rest] = args;
        if (isRecord(first)) return originalUpdate(stringifyJsonValues(first), ...rest);
        return originalUpdate(...args);
    };

    const originalThen = builder.then.bind(builder);
    builder.then = (
        onFulfilled?: ((value: unknown) => unknown) | null,
        onRejected?: ((reason: unknown) => unknown) | null,
    ) => {
        // Each attempt runs the query again. The first attempt executes the
        // original builder via its captured `then`; retries re-run a fresh
        // clone (knex builders are single-shot) whose `then` is the original
        // prototype method — re-acquiring a healthy connection from the pool.
        let attempt = 0;
        const execute = () => {
            const cloneable = typeof builder.clone === 'function';
            const target = attempt === 0 || !cloneable ? null : builder.clone();
            const thenFn = target ? target.then.bind(target) : originalThen;
            attempt += 1;
            return new Promise<unknown>((resolve, reject) => {
                thenFn(
                    (result: unknown) => {
                        const processed = parseJsonResult(result);
                        resolve(
                            typeof onFulfilled === 'function' ? onFulfilled(processed) : processed,
                        );
                    },
                    (reason: unknown) => {
                        if (isDeadlock(reason)) options.onDeadlock?.(reason);
                        if (isRetryableConnectionError(reason)) options.onConnectionError?.(reason);
                        reject(reason);
                    },
                );
            });
        };
        return withConnectionRetry(execute, options).then(undefined, (reason: unknown) => {
            if (typeof onRejected === 'function') return onRejected(reason);
            throw reason;
        });
    };

    return builder;
}

/**
 * Intercept the `then` rejection path of a thenable (e.g. a knex `Raw` result)
 * so MySQL deadlocks are reported via `options.onDeadlock` and transient
 * connection errors are reported via `options.onConnectionError` / retried via
 * `options.retry`. `rerun()` re-creates the query (e.g. re-invoking
 * `knex.raw(...)` with the same args) so a connection failure can be retried.
 * Mirrors the rejection interception in {@link wrapJsonBuilder} without the JSON
 * column handling, which does not apply to `raw` queries / stored-procedure calls.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function attachQueryHook(thenable: any, options: WrapKnexOptions, rerun: () => any): any {
    const originalThen = thenable.then.bind(thenable);
    thenable.then = (
        onFulfilled?: ((value: unknown) => unknown) | null,
        onRejected?: ((reason: unknown) => unknown) | null,
    ) => {
        // The first attempt runs the original thenable via its captured `then`;
        // retries re-invoke `rerun()` to obtain a fresh thenable backed by a new
        // query (and, for raw, a freshly acquired pool connection).
        let attempt = 0;
        const execute = () => {
            const target = attempt === 0 ? null : rerun();
            const thenFn = target ? target.then.bind(target) : originalThen;
            attempt += 1;
            return new Promise<unknown>((resolve, reject) => {
                thenFn(
                    (result: unknown) =>
                        resolve(typeof onFulfilled === 'function' ? onFulfilled(result) : result),
                    (reason: unknown) => {
                        if (isDeadlock(reason)) options.onDeadlock?.(reason);
                        if (isRetryableConnectionError(reason)) options.onConnectionError?.(reason);
                        reject(reason);
                    },
                );
            });
        };
        return withConnectionRetry(execute, options).then(undefined, (reason: unknown) => {
            if (typeof onRejected === 'function') return onRejected(reason);
            throw reason;
        });
    };
    return thenable;
}

/**
 * Wrap the shared knex instance so every query path is deadlock-aware (and
 * `knex('table')` builders are JSON-column aware):
 *   - `knex('table')`     → {@link wrapJsonBuilder} (JSON columns + deadlock hook)
 *   - `knex.raw(...)`      → deadlock hook (covers stored-procedure `CALL` + SQL)
 *   - `knex.transaction()` → the returned `trx` is wrapped like the top-level
 *     knex, so queries inside transactions are JSON-aware and deadlock-aware.
 * All other knex surface (`.fn`, `.client`, `.schema`, ...) is left untouched
 * via the default Proxy get behaviour.
 *
 * The parameter is intentionally unconstrained: the installed `knex` types and
 * the `Knex` re-exported by `@feasibleone/blong` are structurally different, so
 * callers cast the result with `as unknown as Knex`.
 */
export function wrapKnex<T>(knex: T, options: WrapKnexOptions = {}): T {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return new Proxy(knex as any, {
        apply(target, thisArg, args) {
            return wrapJsonBuilder(Reflect.apply(target, thisArg, args), options);
        },
        get(target, prop, receiver) {
            if (typeof prop !== 'string') return Reflect.get(target, prop, receiver);
            if (prop === 'raw') {
                const original = Reflect.get(target, prop, target);
                if (typeof original !== 'function') return original;
                const bound = original.bind(target);
                return (...args: unknown[]) =>
                    attachQueryHook(bound(...args), options, () => bound(...args));
            }
            if (prop === 'transaction') {
                const original = Reflect.get(target, prop, target);
                if (typeof original !== 'function') return original;
                const bound = original.bind(target);
                return (...args: unknown[]) => {
                    const cbIndex = args.findIndex(arg => typeof arg === 'function');
                    if (cbIndex !== -1) {
                        const cb = args[cbIndex] as (trx: unknown) => unknown;
                        const nextArgs = [...args];
                        nextArgs[cbIndex] = (trx: unknown) => cb(wrapKnex(trx, options));
                        return bound(...nextArgs);
                    }
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const result = bound(...args) as any;
                    return typeof result?.then === 'function'
                        ? result.then((trx: unknown) => wrapKnex(trx, options))
                        : result;
                };
            }
            return Reflect.get(target, prop, receiver);
        },
    });
}
