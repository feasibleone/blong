/**
 * What the chain runner does with Allure reporting when it cannot have it.
 *
 * Allure 3's format is a directory of files, so the integration needs a filesystem.
 * A browser platform has none, and the lazy import of `blong-allure` there can only
 * fail — which the runner used to discover once per group, leaving a run with no
 * results and no explanation of why. These tests pin the two halves of the fix: the
 * platform decides *before* the attempt, and the reason is reported once for the run
 * rather than once per group.
 *
 * Each test imports the module fresh: the session, the run's options and the reason
 * it cannot report are module-level state, and a test that inherited them from the
 * one before it would be asserting the previous test's outcome.
 */

import {existsSync} from 'node:fs';
import {mkdtemp, readdir, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {test} from 'tap';

/** A test context that runs what it is given, the way the runner's own does. */
interface IContext {
    test: (name: string, fn: (t: IContext) => unknown) => Promise<unknown>;
}

function contextAt(): IContext {
    return {
        test: async (_name: string, fn: (t: IContext) => unknown) => fn(contextAt()),
    };
}

/** A group's steps, named the way the runner names them from the wire name. */
function group(name: string, steps: Array<() => unknown>): Array<() => unknown> {
    const wrapped = [...steps];
    Object.defineProperty(wrapped, 'name', {value: name});
    return wrapped;
}

/** The log the runner is handed, recording what a run would have shown a reader. */
function recordingLog(): {
    warnings: string[];
    errors: unknown[];
    log: {warn: (text: unknown) => void; error: (error: unknown) => void};
} {
    const warnings: string[] = [];
    const errors: unknown[] = [];
    return {
        warnings,
        errors,
        log: {
            warn: (text: unknown) => void warnings.push(String(text)),
            error: (error: unknown) => void errors.push(error),
        },
    };
}

test('a browser run is told why it produces no report, once for the run', async t => {
    const dir = await mkdtemp(join(tmpdir(), 'blong-chain-allure-'));
    t.teardown(() => rm(dir, {recursive: true, force: true}));
    const outputDir = join(dir, 'allure-results');
    const {warnings, errors, log} = recordingLog();
    const ran: string[] = [];
    const {default: chainFactory} = await t.mockImport<typeof import('./chain.ts')>(
        './chain.ts',
        {},
    );

    const chain = await chainFactory(contextAt() as never, log, {
        method: 'test.order.checkpoint',
        allure: {enabled: true, outputDir},
        platform: 'browser',
    });
    const run = chain as unknown as (steps: unknown) => Promise<unknown>;
    await run(
        group('order checkpoint', [
            async function loadsOrder() {
                ran.push('loadsOrder');
                return 'loaded';
            },
        ]),
    );
    // A second group, whose own attempt would be a second opportunity to say the
    // same thing: the answer belongs to the run, so it is said once.
    await run(
        group('payment settle', [
            async function sendsPayment() {
                ran.push('sendsPayment');
                return 'sent';
            },
        ]),
    );

    t.same(
        ran,
        ['loadsOrder', 'sendsPayment'],
        'the groups ran: a withheld report is not a withheld test',
    );
    t.equal(warnings.length, 1, 'the reader is told once, not once per group');
    t.match(warnings[0] ?? '', /browser platform cannot write its files/, 'and told the reason');
    t.match(warnings[0] ?? '', /Allure reporting is enabled/, 'as a configuration mistake');
    t.same(errors, [], 'nothing failed: the tests are judged on their tests');
    t.notOk(existsSync(outputDir), 'and no results directory was created');

    // The end of the run closes nothing, because nothing opened: no session means no
    // import, which on this platform is the one thing that cannot work.
    await (await import('./chain.ts')).endAllureSession();
});

test('a server run opens the session and writes the group result', async t => {
    const dir = await mkdtemp(join(tmpdir(), 'blong-chain-allure-'));
    t.teardown(() => rm(dir, {recursive: true, force: true}));
    const outputDir = join(dir, 'allure-results');
    const {warnings, errors, log} = recordingLog();
    const {default: chainFactory, endAllureSession} = await t.mockImport<
        typeof import('./chain.ts')
    >('./chain.ts', {});

    const chain = await chainFactory(contextAt() as never, log, {
        method: 'test.order.checkpoint',
        allure: {enabled: true, outputDir},
        platform: 'server',
    });
    await (chain as unknown as (steps: unknown) => Promise<unknown>)(
        group('order checkpoint', [
            async function loadsOrder() {
                return 'loaded';
            },
        ]),
    );

    t.same(warnings, [], 'a server platform reports nothing and says nothing');
    t.same(errors, []);
    const written = await readdir(outputDir);
    t.ok(
        written.includes('environment.properties'),
        'the session laid out its directory, as it does for a real run',
    );
    const resultFile = written.find(name => name.endsWith('-result.json'));
    t.ok(resultFile, 'and the group left a result');
    const result = JSON.parse(await readFile(join(outputDir, resultFile as string), 'utf8')) as {
        name?: string;
        labels?: Array<{name: string; value: string}>;
    };
    t.equal(result.name, 'order checkpoint', 'named as the group was run');
    t.ok(
        result.labels?.some(label => label.name === 'parentSuite' && label.value === 'test'),
        'labelled from the group wire name',
    );

    // The end writes to stdout, which a tap run parses: its line is captured here
    // rather than left in the middle of the suite's output.
    const lines: string[] = [];
    const original = console.log;
    console.log = (...args: unknown[]) => void lines.push(args.join(' '));
    try {
        await endAllureSession();
    } finally {
        console.log = original;
    }
    t.match(
        lines.join(''),
        /Allure results written to/,
        'the run ends by saying where the results are',
    );

    // Nothing is left to close: the second end is a no-op rather than a second report.
    await endAllureSession();
});

test('a failure to start is reported once, and leaves nothing to close', async t => {
    const dir = await mkdtemp(join(tmpdir(), 'blong-chain-allure-'));
    t.teardown(() => rm(dir, {recursive: true, force: true}));
    const {warnings, errors, log} = recordingLog();
    let started = 0;
    let ended = 0;
    const {default: chainFactory, endAllureSession} = await t.mockImport<
        typeof import('./chain.ts')
    >('./chain.ts', {
        // A server platform that cannot import the integration at all — a package
        // missing on the runner, say. The runner cannot prevent this one; it can only
        // say it once and carry on.
        '@feasibleone/blong-allure': {
            allureSessionStart: async () => {
                started += 1;
                throw new Error('blong-allure is not installed');
            },
            allureSessionEnd: async () => {
                ended += 1;
            },
            allureGroupResultWrite: async () => undefined,
        },
    });

    const chain = await chainFactory(contextAt() as never, log, {
        method: 'test.order.checkpoint',
        allure: {enabled: true, outputDir: join(dir, 'allure-results')},
        platform: 'server',
    });
    const run = chain as unknown as (steps: unknown) => Promise<unknown>;
    const step = async function loadsOrder() {
        return 'loaded';
    };
    await run(group('order checkpoint', [step]));
    await run(group('payment settle', [step]));

    t.equal(started, 1, 'one attempt, however many groups ask for a report');
    t.equal(errors.length, 1, 'and one report of it, not one per group');
    t.match(String(errors[0]), /blong-allure is not installed/, 'naming what went wrong');
    t.same(warnings, [], 'an unexpected failure is not a platform refusal');

    // A session that never opened is nothing to close: the end is a no-op, so a run
    // that could not write results does not also try to generate a report from them.
    await endAllureSession();
    t.equal(ended, 0, 'the end of the run closes nothing');
});
