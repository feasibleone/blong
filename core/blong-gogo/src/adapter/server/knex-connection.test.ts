import {test} from 'tap';

import {poolOptionsWithConnectionLogging} from './knex.ts';

/**
 * A pooled connection's `error` event belongs to the socket, not to a call.
 *
 * mysql2 emits it there, no promise rejects, and with no listener Node ends the process — which is how
 * `getaddrinfo EAI_AGAIN` for a database name that did not resolve took a whole run down from a path
 * documented as warn-and-continue (T-250). The pool's own `afterCreate` is the only hook that sees
 * every connection it will ever open, so the listener is attached there; these assertions cover both
 * halves: the listener exists and logs, and a pool hook the caller configured still runs.
 */

/** As much of a connection as the hook touches. */
const connectionStub = (): {
    listeners: Array<(error: unknown) => void>;
    on: (event: string, listener: (error: unknown) => void) => void;
} => {
    const listeners: Array<(error: unknown) => void> = [];
    return {
        listeners,
        on(event: string, listener: (error: unknown) => void) {
            if (event === 'error') listeners.push(listener);
        },
    };
};

test('every pooled connection gets an error listener that logs and keeps going', t => {
    const logged: Array<{fields: object; message: string}> = [];
    const pool = poolOptionsWithConnectionLogging(undefined, {
        warn: (fields: object, message: string) => logged.push({fields, message}),
    });

    const connection = connectionStub();
    let finished = 0;
    (pool.afterCreate as (c: unknown, d: () => void) => void)(connection, () => {
        finished += 1;
    });

    t.equal(connection.listeners.length, 1, 'the connection carries the listener');
    t.equal(finished, 1, 'and the pool is told the connection is ready');

    const error = Object.assign(new Error('getaddrinfo EAI_AGAIN db'), {code: 'EAI_AGAIN'});
    connection.listeners[0]?.(error);
    t.equal(logged.length, 1, 'the socket error is logged');
    t.match(
        String(logged[0]?.fields && (logged[0].fields as {err?: string}).err),
        /EAI_AGAIN/,
        'with the reason, which is the part a silent death never showed',
    );
    t.match(logged[0]?.message ?? '', /the pool opens another/, 'and what the pool does about it');
    t.end();
});

test('a pool hook the caller configured still runs', t => {
    const seen: unknown[] = [];
    const pool = poolOptionsWithConnectionLogging(
        {
            afterCreate: (connection: unknown, done: () => void) => {
                seen.push(connection);
                done();
            },
        },
        {warn: () => undefined},
    );

    const connection = connectionStub();
    let finished = 0;
    (pool.afterCreate as (c: unknown, d: () => void) => void)(connection, () => {
        finished += 1;
    });

    t.equal(seen.length, 1, 'the configured hook is called rather than replaced');
    t.equal(seen[0], connection, 'with the connection the pool made');
    t.equal(finished, 1, 'and the pool is still told it is ready');
    t.equal(connection.listeners.length, 1, 'while the logging listener is attached either way');
    t.end();
});
