/**
 * Integration test: the real `blong` CLI must shut down gracefully when it receives
 * SIGTERM — the signal Kubernetes sends to a pod it is terminating.
 *
 * The CLI is spawned against the minimal `blong-hello` fixture and one signal is sent to
 * a *running* server, which is what the two assertions are about:
 *   - exit code 0 — the app caught SIGTERM, ran its teardown and exited cleanly. Without
 *     a handler node's default action ends the process on the signal.
 *   - stderr contains the deterministic shutdown marker, and stdout the `adapter.stop`
 *     events of the teardown.
 *
 * Three details are what make the test about the shutdown path rather than about the run
 * it happens to be given:
 *   - The signal waits for the readiness line (the watch layer reporting it has nothing to
 *     run, which `runServer.ts` reaches only after `platform.start()` returned and the
 *     shutdown handler was installed) instead of a fixed delay. A signal that arrives while
 *     the app is still loading is answered by node's default action, and the test then fails
 *     for a reason that has nothing to do with the code under test.
 *   - The fixture is asked for an OS-chosen gateway port. It otherwise serves on 8080, and a
 *     job that runs every project's tests in parallel (`rush ci-test --parallelism=max`) has
 *     a sibling project's server on that port often enough: the CLI then dies of
 *     `EADDRINUSE` with exit 1, which reads exactly like a failed graceful shutdown
 *     (@@F-528).
 *   - The child's own output goes into the failure message, because a run that dies before it
 *     can handle the signal reports nothing else.
 */

import {spawn} from 'node:child_process';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {test} from 'tap';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const blongBin = resolve(repoRoot, 'core', 'blong-gogo', 'bin', 'blong.ts');
const helloDir = resolve(repoRoot, 'demo', 'blong-hello');

/** How long the app may take to report that it is serving. */
const READY_TIMEOUT_MS = 120_000;
/** How long a graceful shutdown may take before it is forced. */
const SHUTDOWN_TIMEOUT_MS = 15_000;

test(
    'blong CLI exits 0 with the shutdown marker after SIGTERM',
    {skip: process.platform === 'win32'},
    async t => {
        // A replaced environment rather than an inherited one: tap's @tapjs/processinfo
        // injects NODE_OPTIONS (its `--import` hook) into every spawned child, which breaks
        // the child's pino `.ts` transport worker ("Unexpected identifier 'PinoPretty'").
        // `blong-hello` needs no external services, so these four are enough.
        const child = spawn(process.execPath, [blongBin, '--gateway.port=0'], {
            cwd: helloDir,
            stdio: ['ignore', 'pipe', 'pipe'],
            env: {
                PATH: process.env['PATH'] ?? '',
                HOME: process.env['HOME'] ?? '',
                USER: process.env['USER'] ?? '',
                LOGNAME: process.env['LOGNAME'] ?? '',
            },
        });
        let out = '';
        let err = '';
        child.stdout.on('data', chunk => (out += chunk));
        child.stderr.on('data', chunk => (err += chunk));
        let ended = false;
        const exited = new Promise<number | null>(resolveCode => {
            child.on('exit', code => {
                ended = true;
                resolveCode(code);
            });
        });

        // Readiness, not a delay: the signal must reach a server that can handle it.
        const ready = await waitFor(
            () => /nothing to run/.test(out),
            READY_TIMEOUT_MS,
            () => ended,
        );
        if (ready) child.kill('SIGTERM');
        else child.kill('SIGKILL');

        const code = ready
            ? await Promise.race([
                  exited,
                  delay(SHUTDOWN_TIMEOUT_MS).then(() => {
                      child.kill('SIGKILL');
                      return null;
                  }),
              ])
            : await exited;

        const diagnosis =
            `\n  ready: ${ready}` +
            `\n  --- child stderr ---\n${err.trim()}` +
            `\n  --- child stdout (last lines) ---\n${out.trim().split('\n').slice(-6).join('\n')}`;
        t.equal(code, 0, `exit code 0 (graceful shutdown), got ${code}${diagnosis}`);
        t.match(err, /blong: shutting down on SIGTERM/, 'stderr contains the shutdown marker');
        t.match(out, /adapter\.stop/, 'teardown ran (adapter.stop events fired)');
    },
);

/** Wait for `predicate` to hold, giving up at the deadline or when the process ends. */
async function waitFor(
    predicate: () => boolean,
    ms: number,
    ended: () => boolean,
): Promise<boolean> {
    const deadline = Date.now() + ms;
    while (!predicate() && !ended() && Date.now() < deadline) await delay(50);
    return predicate();
}

/** A promise that settles after `ms` — the watchdog half of a `Promise.race`. */
function delay(ms: number): Promise<void> {
    return new Promise(resolveDelay => setTimeout(resolveDelay, ms).unref?.());
}
