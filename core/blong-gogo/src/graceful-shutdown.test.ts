/**
 * Unit tests for the graceful shutdown helper in runServer.ts.
 *
 * The helper's dependencies (exit, write, timer) are injected so the tests can
 * drive the handler with a plain signal string without terminating the process.
 * Emitting real SIGTERM/SIGINT would collide with the tap runner's own signal
 * handling, so the handler logic is exercised via `createShutdownHandler` and the
 * process wiring is verified separately via listener counts.
 */

import {test} from 'tap';

import {createShutdownHandler, gracefulShutdown} from './runServer.ts';

test('SIGTERM stops the platform and exits 0 with the shutdown marker', async t => {
    let marker = '';
    let exitCode: number | undefined;
    const stopped: string[] = [];
    const {handler} = createShutdownHandler(
        async () => {
            stopped.push('stop');
        },
        {
            write: s => (marker += s),
            exit: code => (exitCode = code),
            timeoutMs: 1000,
        },
    );

    handler('SIGTERM');
    await Promise.resolve();
    await Promise.resolve();

    t.equal(exitCode, 0, 'exits 0 after clean shutdown');
    t.match(marker, /blong: shutting down on SIGTERM/, 'writes the shutdown marker');
    t.same(stopped, ['stop'], 'platform stop() was awaited');
});

test('SIGINT also triggers a graceful shutdown', async t => {
    let marker = '';
    let exitCode: number | undefined;
    const {handler} = createShutdownHandler(async () => undefined, {
        write: s => (marker += s),
        exit: code => (exitCode = code),
        timeoutMs: 1000,
    });

    handler('SIGINT');
    await Promise.resolve();
    await Promise.resolve();

    t.equal(exitCode, 0, 'exits 0 on SIGINT');
    t.match(marker, /blong: shutting down on SIGINT/, 'writes the marker for SIGINT');
});

test('a second signal forces an immediate exit', async t => {
    const exitCodes: number[] = [];
    const {handler} = createShutdownHandler(
        () => new Promise(() => {}), // never settles
        {
            write: () => {},
            exit: code => exitCodes.push(code),
            timeoutMs: 50_000,
        },
    );

    handler('SIGTERM');
    handler('SIGTERM');

    t.same(exitCodes, [1], 'second signal exits 1');
});

test('a failing stop() exits 1 with a failure marker', async t => {
    let marker = '';
    let exitCode: number | undefined;
    const {handler} = createShutdownHandler(
        async () => {
            throw new Error('boom');
        },
        {
            write: s => (marker += s),
            exit: code => (exitCode = code),
            timeoutMs: 1000,
        },
    );

    handler('SIGTERM');
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    t.equal(exitCode, 1, 'exits 1 when teardown fails');
    t.match(marker, /blong: graceful shutdown failed/, 'writes the failure marker');
});

test('gracefulShutdown registers and unregisters process signal handlers', async t => {
    const before = process.listenerCount('SIGTERM');
    const off = gracefulShutdown(async () => undefined, {
        write: () => {},
        exit: () => {},
        timeoutMs: 1000,
    });
    t.equal(process.listenerCount('SIGTERM'), before + 1, 'registers a SIGTERM listener');
    t.equal(process.listenerCount('SIGINT'), before + 1, 'registers a SIGINT listener');

    off();
    t.equal(process.listenerCount('SIGTERM'), before, 'unregisters the SIGTERM listener');
    t.equal(process.listenerCount('SIGINT'), before, 'unregisters the SIGINT listener');
});
