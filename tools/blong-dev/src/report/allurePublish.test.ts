/**
 * Tests for the Allure merge a package publishes.
 *
 * The `allure` binary is stubbed: what is checked here is what this tool does around it —
 * staging every producer's results into one directory, moving the trace archives out of
 * the single-file report, handing Allure the package's history slice, and copying the
 * generated report into the published directory without touching what is already there.
 */

import {
    existsSync,
    mkdirSync,
    mkdtempSync,
    readdirSync,
    rmSync,
    utimesSync,
    writeFileSync,
} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {test} from 'tap';

import {ALLURE_PUBLISH_DIR, publishAllureReport} from './allurePublish.ts';

/** A package directory with the results one or more producers left behind. */
function packageWith(resultsDirs: Record<string, string[]>): string {
    const cwd = mkdtempSync(join(tmpdir(), 'blong-allure-merge-'));
    for (const [dir, entries] of Object.entries(resultsDirs)) {
        mkdirSync(join(cwd, dir), {recursive: true});
        for (const entry of entries) writeFileSync(join(cwd, dir, entry), entry);
    }
    return cwd;
}

/** A stubbed `allure` that writes what a successful run would have written. */
function stubAllure(): {
    calls: string[][];
    /** What the staged results directory held, as Allure saw it. */
    staged: string[][];
    run: (command: string, args: string[], cwd: string) => Promise<number>;
} {
    const calls: string[][] = [];
    const staged: string[][] = [];
    return {
        calls,
        staged,
        run: async (_command, args, cwd) => {
            calls.push(args);
            const out = args[args.indexOf('-o') + 1];
            staged.push(readdirSync(args[args.length - 1]));
            mkdirSync(join(out), {recursive: true});
            writeFileSync(join(out, 'index.html'), 'report');
            writeFileSync(join(out, 'summary.json'), '{}');
            return 0;
        },
    };
}

test('publishAllureReport merges every producer into one report', async t => {
    const cwd = packageWith({
        'allure-results': ['browser-result.json', 'pw-attachment.zip'],
        'allure-results-tap': ['handler-result.json'],
    });
    const allure = stubAllure();

    const published = await publishAllureReport(cwd, {run: allure.run, baseHistory: ''});

    t.equal(published.published, true, 'a report was published');
    t.equal(published.producers, 2, 'both producers went into it');
    t.equal(published.reportDir, ALLURE_PUBLISH_DIR);

    // Everything Allure was asked to render, in one staging directory.
    const staged = allure.staged[0];
    t.same(
        [...staged].sort(),
        ['browser-result.json', 'handler-result.json'],
        'both producers results are in the one directory Allure renders',
    );

    // The trace archive is kept beside the report, not inlined into it.
    t.ok(
        existsSync(join(cwd, '.ci-report', 'publish', 'traces', 'pw-attachment.zip')),
        'the trace archive moved to the published directory',
    );
    t.equal(
        staged.includes('pw-attachment.zip'),
        false,
        'and out of what the single-file report embeds',
    );

    // One report per package, with the package history slice handed to Allure.
    const args = allure.calls[0];
    t.equal(args[0], 'awesome');
    t.ok(args.includes('--single-file'), 'the published report is a single file');
    t.equal(args[args.indexOf('--history-path') + 1], join(cwd, '.ci-report', 'history.jsonl'));
    t.ok(existsSync(join(cwd, '.ci-report', 'publish', 'index.html')), 'the report was published');
    t.equal(
        existsSync(join(cwd, '.ci-report', '.allure-merge')),
        false,
        'the staging directory is not left behind',
    );

    rmSync(cwd, {recursive: true, force: true});
});

test('publishAllureReport leaves a package with no results alone', async t => {
    const cwd = packageWith({});
    const allure = stubAllure();

    const published = await publishAllureReport(cwd, {run: allure.run});

    t.equal(published.published, false, 'nothing to publish');
    t.equal(allure.calls.length, 0, 'Allure is not invoked');
    t.equal(existsSync(join(cwd, '.ci-report')), false, 'and nothing is created for it');

    rmSync(cwd, {recursive: true, force: true});
});

test('publishAllureReport regenerates only for results written since the last report', async t => {
    const cwd = packageWith({'allure-results': ['browser-result.json']});
    const allure = stubAllure();

    const first = await publishAllureReport(cwd, {run: allure.run});
    t.equal(first.published, true, 'the first run publishes');
    t.equal(allure.calls.length, 1);

    // The results are older than the report: no producer has run since, which is the
    // ordinary state of every package that keeps a browser report around.
    const past = new Date(Date.now() - 3_600_000);
    utimesSync(join(cwd, 'allure-results', 'browser-result.json'), past, past);

    const second = await publishAllureReport(cwd, {run: allure.run});
    t.equal(second.published, false, 'a leftover result does not regenerate a report');
    t.equal(allure.calls.length, 1, 'Allure is not invoked a second time');

    // A producer writing after the report is what asks for it again. The write is dated
    // forward so the comparison does not depend on both happening inside one millisecond.
    const fresh = join(cwd, 'allure-results', 'second-result.json');
    writeFileSync(fresh, 'second');
    const ahead = new Date(Date.now() + 1000);
    utimesSync(fresh, ahead, ahead);
    const third = await publishAllureReport(cwd, {run: allure.run});
    t.equal(third.published, true, 'fresh results are merged');
    t.equal(allure.calls.length, 2);

    rmSync(cwd, {recursive: true, force: true});
});
