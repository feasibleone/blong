/**
 * R18/R19/R21 acceptance, end to end: a *real* process, a real stdout, a real
 * store on disk, resolved by a *separate* process after the first has exited,
 * with no service running. The in-process tests cannot prove any of that, which
 * is why this file exists.
 *
 * The CLI is invoked through a **symlink** to the declared `bin` entry, not by
 * naming the source file. That is how an installed `bin` is reached, and only
 * that path exercises the entry guard as shipped: the guard compares
 * `import.meta.url` (the real file the loader resolved) with
 * `realpathSync(process.argv[1])` (the link that was invoked), so a direct run
 * would pass for the wrong reason and a linked run would silently print nothing
 * and exit 0. The first test asserts the resolved record precisely because a
 * broken guard cannot produce that output.
 */

import {execFile} from 'node:child_process';
import {mkdir, mkdtemp, rm, symlink, writeFile} from 'node:fs/promises';
import {homedir, tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {promisify} from 'node:util';
import t from 'tap';

const run = promisify(execFile);

/** The package root, from this file's own location (`test/`). */
const pkgDir = fileURLToPath(new URL('..', import.meta.url));

interface Attempt {
    /**
     * The exit code, or `null` when the process never reached an exit at all.
     *
     * A spawn failure (`ENOENT`) and the timeout kill produce no code, and they
     * used to be reported as `1` — the CLI's own contract code for an unknown
     * reference — so only the `stderr` matches stopped a process that never
     * launched from passing as a real exit. `null` is not a code any exit can
     * produce, so an assertion on a contract code cannot pass by accident.
     */
    code: number | null;
    stdout: string;
    stderr: string;
}

/**
 * What the runner exports to the processes it spawns.
 *
 * `NODE_OPTIONS` carries `@tapjs/processinfo`'s import hook and the
 * `_TAPJS_PROCESSINFO_*` keys configure it. A child that inherits them writes
 * its own coverage ledger into the shared `.tap/` directory, and those stray
 * ledgers are merged into this run's report: every one of them describes a
 * process that ran a handful of lines of each module, and with them the report
 * collapsed from a full 100% to roughly 90%. Worse, processinfo patches
 * `child_process` itself (`@tapjs/processinfo/dist/esm/child_process.js`), so
 * `NODE_OPTIONS` is forced onto a child whatever `env` the caller passes. The
 * only way to reach a process that looks like a real CLI invocation is to let
 * that patch apply to `/usr/bin/env`, which ignores it, and have `env -i` start
 * the real program with an environment of our choosing.
 */
function runnerInstrumentation(): string[] {
    return Object.keys(process.env).filter(
        key => key === 'NODE_OPTIONS' || key === 'NODE_TEST_CONTEXT' || key.startsWith('_TAPJS_PROCESSINFO_'),
    );
}

/** The one variable the shebang's `env -S node` needs to find the interpreter. */
const CLEAN_PATH = `${dirname(process.execPath)}:/usr/bin:/bin`;

/** Run a command to completion, reporting its outcome instead of throwing. */
async function attempt(file: string, args: string[], timeout = 30_000): Promise<Attempt> {
    try {
        const {stdout, stderr} = await run(
            '/usr/bin/env',
            ['-i', `PATH=${CLEAN_PATH}`, `HOME=${homedir()}`, file, ...args],
            {timeout},
        );
        return {code: 0, stdout, stderr};
    } catch (error) {
        // A non-zero exit is an ordinary outcome here (the CLI's codes are part
        // of its contract). Only a real exit has an exit code: a spawn error and
        // the timeout kill reach none, and are reported as `null` — never as the
        // CLI's own `1` — with the kill marked on stderr.
        const failure = error as {code?: number | string; killed?: boolean; stdout?: string; stderr?: string};
        const exited = typeof failure.code === 'number' && !failure.killed ? failure.code : null;
        return {
            code: exited,
            stdout: failure.stdout ?? '',
            stderr: `${failure.stderr ?? ''}${failure.killed ? '\n[killed by the test timeout]' : ''}`,
        };
    }
}

interface Fixture {
    /** The store the emitted record lands in. */
    cacheDir: string;
    /** The symlinked `bin` entry the CLI is invoked through. */
    link: string;
}

/**
 * Build the `bin` link and the writer script inside an already-created root.
 *
 * The caller creates the root and registers its removal *before* calling this,
 * so a throw from `mkdir`, `symlink` or `writeFile` cannot leak it: registering
 * the teardown only after this resolved, as it used to, left the whole temporary
 * directory behind whenever the fixture failed to build.
 */
async function fixture(root: string): Promise<Fixture> {
    const linkDir = join(root, 'bin');
    const cacheDir = join(root, 'cache');
    await mkdir(linkDir);
    const link = join(linkDir, 'semantic-log-inspect');
    await symlink(join(pkgDir, 'bin', 'semantic-log-inspect.ts'), link);

    // The writer is a real program in a real process: it opens the store, emits
    // one record and exits. It is written into the temporary root (which is
    // removed with it) so nothing about the run survives the test. Only the
    // package's own `.ts` modules are imported, by absolute URL: a bare
    // specifier would be resolved from the temporary directory and fail.
    const script = [
        `import {createLogger} from ${JSON.stringify(pathToFileURL(join(pkgDir, 'src', 'logger.ts')).href)};`,
        `import {openCache} from ${JSON.stringify(pathToFileURL(join(pkgDir, 'src', 'cache.ts')).href)};`,
        '',
        `const cache = await openCache({dir: ${JSON.stringify(cacheDir)}, limit: 100});`,
        `const logger = createLogger({service: 'payer', cache});`,
        `logger.info('transfer prepared');`,
        `await logger.flush();`,
        `await cache.close();`,
        '',
    ].join('\n');
    await writeFile(join(root, 'emit.mjs'), script);
    return {cacheDir, link};
}

t.test('a linked invocation resolves a record whose writer has exited', async t => {
    // Created and registered here, before the fixture is built: `fixture()`
    // used to create the root and the caller registered its removal only after
    // it resolved, so a throw while building it left the root behind.
    const root = await mkdtemp(join(tmpdir(), 'semantic-log-spawn-'));
    t.teardown(() => rm(root, {recursive: true, force: true}));
    const {cacheDir, link} = await fixture(root);
    t.comment(`the runner exported to its children: ${runnerInstrumentation().join(', ') || 'nothing'}`);

    const emitted = await attempt(process.execPath, [join(root, 'emit.mjs')]);
    t.equal(emitted.code, 0, 'the writer exits cleanly with no service configured (R18)');
    t.match(emitted.stdout, /transfer prepared/, 'readable stdout from a real process (R18)');
    const reference = /(semlog:\/\/t\/[0-9a-f]+)/.exec(emitted.stdout)?.[1];
    t.ok(reference, 'the rendered line carries a reference, minted without contacting anything (R19)');

    // The writer is gone and nothing is running. A second, independent process
    // reads the reference back from disk. The line asserting that it printed is
    // also the assertion that the linked entry guard ran: a guard that failed to
    // resolve the link would print nothing and still exit 0. That match is the
    // only real evidence that the CLI was reached *through the link* — the
    // `t.ok((await lstat(link)).isSymbolicLink(), …)` that used to stand at the
    // top of this test asserted the fixture instead, and could only fail if
    // `symlink()` had already thrown, so it was removed rather than kept as
    // decoration.
    const resolved = await attempt(link, ['--cache', cacheDir, reference ?? '']);
    t.equal(resolved.code, 0, 'the linked bin path exits 0 on a retained reference');
    t.match(resolved.stdout, /payer transfer prepared/, "R21 acceptance: the link resolved the writer's record after it exited");
    t.match(
        resolved.stdout,
        /semlog:\/\/t\/[0-9a-f]+/,
        'the resolved record is itself referenceable',
    );
});

t.test('a linked invocation reports an unknown reference and a usage error distinctly', async t => {
    const root = await mkdtemp(join(tmpdir(), 'semantic-log-spawn-'));
    t.teardown(() => rm(root, {recursive: true, force: true}));
    const {cacheDir, link} = await fixture(root);
    await attempt(process.execPath, [join(root, 'emit.mjs')]);

    const unknown = await attempt(link, ['--cache', cacheDir, 'semlog://r/01J8Z9K2M9PQRSTVWXYZ0A1B2C']);
    t.equal(unknown.code, 1, 'an unknown reference exits 1');
    t.match(unknown.stderr, /unknown reference/, 'and says which reference did not resolve');

    const usage = await attempt(link, ['--cache', cacheDir]);
    t.equal(usage.code, 3, 'a command line with no reference exits 3');
    t.match(usage.stderr, /reference or id is required/, 'and prints the usage rejection');
});

t.test('a process the runner has to kill is not reported as a CLI exit', async t => {
    // The distinction item 326 asked for, pinned rather than commented: a killed
    // process used to be reported as exit 1, the CLI's own code for an unknown
    // reference, so only the stderr match kept it from passing as a real exit.
    // The short timeout is the only way to reach a kill without a 30s wait.
    const killed = await attempt(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], 250);
    t.equal(killed.code, null, 'a killed process has no exit code, so no contract code is claimed');
    t.match(killed.stderr, /\[killed by the test timeout\]/, 'and the kill is reported on stderr');
});
