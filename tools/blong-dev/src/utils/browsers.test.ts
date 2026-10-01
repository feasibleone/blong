/**
 * Tests for the browser preflight's *decision*, which is what a leg depends on.
 *
 * The install itself is Playwright's, and it is idempotent: what has to be right here
 * is what is asked for — the browser, and the system libraries only when the caller
 * says so, because `--with-deps` needs root and the CI job that installs them runs
 * once. The CLI is injected so the decision can be read without installing anything.
 */

import {test} from 'tap';

import {ensureBrowsers} from './browsers.ts';

/** A stub CLI that records what it was asked to do. */
function stubRun(options: {code?: number; fails?: boolean} = {}) {
    const calls: Array<{command: string; args: string[]; cwd: string}> = [];
    return {
        calls,
        run: async (command: string, args: string[], cwd: string) => {
            calls.push({command, args, cwd});
            if (options.fails) throw new Error('spawn playwright ENOENT');
            return options.code ?? 0;
        },
    };
}

test('ensureBrowsers asks for chromium, and for the system libraries only on request', async t => {
    const cli = stubRun();

    t.equal(await ensureBrowsers('/pkg', {run: cli.run}), 0, 'a successful preflight is 0');
    t.same(
        cli.calls[0],
        {command: 'playwright', args: ['install', 'chromium'], cwd: '/pkg'},
        'the browser is installed in the package, without touching the system packages',
    );

    t.equal(await ensureBrowsers('/pkg', {run: cli.run, withDeps: true}), 0, 'still 0');
    t.same(
        cli.calls[1]?.args,
        ['install', '--with-deps', 'chromium'],
        '--with-deps is opt-in, because it needs root and a package-manager lock',
    );

    t.equal(
        await ensureBrowsers('/pkg', {run: cli.run, browsers: ['firefox']}),
        0,
        'a caller can name other browsers',
    );
    t.same(cli.calls[2]?.args, ['install', 'firefox'], 'and they replace the default');
    t.end();
});

test('ensureBrowsers reports a failed install as its exit code', async t => {
    const cli = stubRun({code: 2});

    const code = await ensureBrowsers('/pkg', {run: cli.run});

    t.equal(code, 2, 'the install failure is passed on rather than swallowed');
    t.end();
});

test('ensureBrowsers reports a CLI it cannot start instead of throwing', async t => {
    const cli = stubRun({fails: true});
    const written: string[] = [];
    const stderr = process.stderr.write.bind(process.stderr);
    process.stderr.write = ((chunk: string) => {
        written.push(String(chunk));
        return true;
    }) as typeof process.stderr.write;
    try {
        const code = await ensureBrowsers('/pkg', {run: cli.run});
        t.equal(code, 1, 'a missing CLI fails the preflight');
    } finally {
        process.stderr.write = stderr;
    }

    t.match(written.join(''), /could not run `playwright install chromium`/, 'and says so');
    t.end();
});
