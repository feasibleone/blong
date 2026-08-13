/**
 * Integration test: the real `blong` CLI must shut down gracefully when the GNU
 * `timeout` command sends SIGTERM — the same signal Kubernetes sends when a pod
 * is being terminated (and the same one `timeout` uses to terminate a command).
 *
 * We spawn the CLI against the minimal `blong-hello` fixture wrapped in
 * `timeout --preserve-status -s TERM` and assert:
 *   - exit code 0 — the app caught SIGTERM, ran its teardown and exited cleanly.
 *     Without graceful handling the process would be SIGKILLed by `--kill-after`.
 *   - stderr contains the deterministic shutdown marker.
 */

import {spawn} from 'node:child_process';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {test} from 'tap';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const blongBin = resolve(repoRoot, 'core', 'blong-gogo', 'bin', 'blong.ts');
const helloDir = resolve(repoRoot, 'core', 'blong-hello');

test(
    'blong CLI exits 0 with the shutdown marker after timeout sends SIGTERM',
    {skip: process.platform === 'win32'},
    async t => {
        // Run the CLI through `env -i` to fully clear the inherited environment.
        // tap's @tapjs/processinfo injects NODE_OPTIONS (its `--import` hook) into
        // every spawned child, which breaks the child's pino `.ts` transport worker
        // ("Unexpected identifier 'PinoPretty'"). `env -i` wipes that before node
        // starts. The `blong-hello` fixture needs no external services, so the small
        // set of vars below is sufficient.
        const envArgs = [
            'env',
            '-i',
            `PATH=${process.env['PATH'] ?? ''}`,
            `HOME=${process.env['HOME'] ?? ''}`,
            `USER=${process.env['USER'] ?? ''}`,
            `LOGNAME=${process.env['LOGNAME'] ?? ''}`,
        ];

        const child = spawn(
            'timeout',
            [
                '--preserve-status',
                '--kill-after=5',
                '-s',
                'TERM',
                '10',
                ...envArgs,
                process.execPath,
                blongBin,
            ],
            {cwd: helloDir, stdio: ['ignore', 'pipe', 'pipe']},
        );
        let out = '';
        let err = '';
        child.stdout.on('data', chunk => (out += chunk));
        child.stderr.on('data', chunk => (err += chunk));

        const code = await new Promise<number | null>(resolveCode => {
            child.on('exit', resolveCode);
        });

        t.equal(code, 0, `exit code 0 (graceful shutdown), got ${code}`);
        t.match(err, /blong: shutting down on SIGTERM/, 'stderr contains the shutdown marker');
        t.match(out, /adapter\.stop/, 'teardown ran (adapter.stop events fired)');
    },
);
