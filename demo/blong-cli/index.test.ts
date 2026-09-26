import {spawnSync} from 'node:child_process';
import {mkdtempSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import t from 'tap';

/**
 * The command's contract, asserted against the real entry point.
 *
 * Spawning the binary rather than importing a handler is deliberate: what this
 * demo claims is that a realm can be driven end-to-end by the `cli` intent, and
 * the only thing that proves it is running the command. It also keeps the test
 * independent of the tap process, which is what lets the `cli` intent's
 * "nothing bound, exit when done" behaviour be observed as an exit code.
 *
 * Every invocation names `--output` explicitly. Left out, the format depends on
 * whether stdout is a TTY (`text` there, `json` when piped) — a sensible default
 * for a human and a trap for a test.
 */
const bin = fileURLToPath(new URL('./bin/blong-cli.ts', import.meta.url));

/**
 * Whether a line is the framework's own logging rather than the command's output.
 *
 * The runtime reports a step that crosses its slow-step margin on stderr: a timestamped
 * `warn …` line with its payload indented two spaces under it, and — for the steps that
 * run before the configured log exists — the same warning in the log's shorter bootstrap
 * form. A shared runner makes ordinary startup steps cross that margin (two seconds of
 * cold start is normal there), so the warnings say nothing about the command, and the
 * assertion below is about what the *command* wrote.
 *
 * Tolerating them rather than asking for a raised margin is deliberate: no margin reaches
 * every step. The registry's port steps and the knex adapter's schema sync call
 * `withProgress` without one, so the value a runner may set leaves them at the compiled
 * default (T-154), and a stricter assertion would keep failing for a reason that is not
 * the command's.
 */
const isFrameworkLog = (line: string): boolean =>
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\s+(?:trace|debug|info|warn|error|fatal)\s/.test(
        line,
    ) ||
    /^(?:trace|debug|info|warn|error|fatal)\s{2}\S/.test(line) ||
    /^ {2}\S/.test(line);

/** The lines on stderr the command itself put there. */
const ownStderr = (stderr: string): string[] =>
    stderr.split('\n').filter(line => line.trim() !== '' && !isFrameworkLog(line));

const run = (args: string[]): {stdout: string; stderr: string; status: number | null} => {
    const result = spawnSync(process.execPath, [bin, ...args], {encoding: 'utf-8'});
    return {stdout: result.stdout, stderr: result.stderr, status: result.status};
};

t.setTimeout(60_000);

t.test('a command dispatches in-process and prints its result on stdout', t => {
    const {stdout, stderr, status} = run(['slug', 'get', '--value=Hello, World!', '--output=text']);

    t.equal(status, 0, 'exits clean');
    t.equal(stdout.trim(), 'hello-world', 'the result is the only thing on stdout');
    t.same(ownStderr(stderr), [], 'and nothing of its own reached stderr');
    t.end();
});

t.test('the machine channel stays parseable', t => {
    const {stdout, status} = run(['slug', 'get', '--value=Hello, World!', '--output=json']);

    t.equal(status, 0, 'exits clean');
    t.equal(JSON.parse(stdout), 'hello-world', 'stdout is the JSON result and nothing else');
    t.end();
});

t.test('the platform is available, so a command can read a file', t => {
    const dir = mkdtempSync(join(tmpdir(), 'blong-cli-'));
    const file = join(dir, 'input.txt');
    writeFileSync(file, 'One two three\nfour five\n');

    const {stdout, status} = run(['statistics', 'get', `--file=${file}`, '--output=text']);
    t.equal(status, 0, 'exits clean');
    t.same(
        stdout.trim().split('\n'),
        ['lines: 2', 'words: 5', 'characters: 24'],
        'the file is read through `this.platform` and rendered for a terminal',
    );
    t.end();
});

t.test('the exit code says whether the command did what was asked', t => {
    t.equal(run(['bogus', 'get']).status, 1, 'an unknown method fails');
    t.match(
        run(['bogus', 'get']).stderr,
        /unknown method 'text\.bogus\.get'/,
        'and says which method it could not find',
    );
    t.equal(run([]).status, 1, 'no arguments prints the usage and fails');
    t.equal(run(['--help']).status, 0, '--help is not a failure');
    t.end();
});

t.test('a handler error is reported without a stack trace on stdout', t => {
    const {stdout, stderr, status} = run(['slug', 'get']);

    t.equal(status, 1, 'fails');
    t.match(stderr, /provide --value=TEXT or --file=PATH/, 'the message is on stderr');
    t.equal(stdout.trim(), '', 'stdout stays parseable');
    t.end();
});
