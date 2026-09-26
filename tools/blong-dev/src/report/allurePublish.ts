/**
 * Publishes a package's Allure report from every producer's results.
 *
 * A package can report to Allure from more than one producer: a realm's browser
 * tests write them, and so do its handler tests. Each producer clears the directory it
 * writes to before a run, so they cannot share one — but they must not become two
 * reports either. The CI report links *one* report per package, and Allure's trend
 * history is kept per package, so two reports would mean two links and two histories to
 * keep in step.
 *
 * This is the one place the merge happens, and both commands that can be a package's
 * last producer call it: it stages every results directory that exists, gives Allure the
 * package's history slice, and writes the single-file report into `.ci-report/publish/`.
 * The report a package publishes is therefore whatever producers ran, in one document,
 * each result labelled with the producer that wrote it.
 *
 * The staging directory lives under `.ci-report/` (which every run clears) rather than in
 * the published directory, and only `index.html` and `summary.json` are copied into the
 * published one, so a report generated again after a later producer — the ordinary case,
 * since one package's test script runs its browser tests and its handler tests in turn —
 * merges instead of replacing what is already there.
 */

import {copyFileSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync} from 'node:fs';
import {join} from 'node:path';

import {historyFile, readHistory, sliceForPackage, writeSlice} from './history.ts';
import {PUBLISH_DIR, REPORT_DIR, packageName, repoRoot, reportDir} from './reportPaths.ts';
import {runTool} from '../utils/runTool.ts';
import {toolEnv} from '../utils/toolPath.ts';

/**
 * Results directories a package may have, by producer.
 *
 * `allure-results` is what the Playwright reporter writes (its default, and what the
 * browser configuration asks for); `allure-results-tap` is what the handler-test runner
 * writes. A third producer adds a name here and nothing else.
 */
export const ALLURE_RESULTS_DIRS = ['allure-results', 'allure-results-tap'] as const;

/** Directory inside `.ci-report/` the merge is staged in. */
const STAGING_DIR = '.allure-merge';

export interface IAllurePublishResult {
    /** Whether a report was generated. */
    published: boolean;
    /** How many producer directories went into it. */
    producers: number;
    /** Where the report was written, package-relative. */
    reportDir?: string;
}

/** Every results directory of this package that holds something, in producer order. */
function resultsDirsOf(cwd: string): string[] {
    return ALLURE_RESULTS_DIRS.map(dir => join(cwd, dir)).filter(
        dir => existsSync(dir) && readdirSync(dir).length > 0,
    );
}

/** The newest modification time in a directory, or 0 when it has no entries. */
function newestMtime(dir: string): number {
    let newest = 0;
    for (const entry of readdirSync(dir)) {
        try {
            newest = Math.max(newest, statSync(join(dir, entry)).mtimeMs);
        } catch {
            // An entry that disappeared between the listing and the stat is not newer
            // than anything, and is not a reason to fail a report.
        }
    }
    return newest;
}

/**
 * When this package's report was last generated, or 0 when it has none yet.
 *
 * A report is only regenerated when a producer wrote results after this moment. Every
 * package keeps `allure-results` from whichever browser run last happened in it, and
 * regenerating a report for results nothing touched would cost seconds of Allure on
 * every handler-test run and publish a stale run as if it were this one.
 */
function publishedMtime(publishDir: string): number {
    try {
        return statSync(join(publishDir, 'index.html')).mtimeMs;
    } catch {
        return 0;
    }
}

/**
 * Stage every producer's results in one directory, and move the trace archives out.
 *
 * The zips are moved rather than copied for the reason the browser command has always
 * moved them: they are large, and a single-file report cannot open an inlined archive
 * through `trace.playwright.dev`. They stay referenced by name from the published
 * directory's `traces/`, which is where the report links them.
 */
function stageResults(cwd: string, staging: string, tracesDir: string): void {
    mkdirSync(staging, {recursive: true});
    for (const dir of resultsDirsOf(cwd)) {
        for (const entry of readdirSync(dir)) {
            const source = join(dir, entry);
            if (entry.endsWith('-attachment.zip')) {
                mkdirSync(tracesDir, {recursive: true});
                renameSync(source, join(tracesDir, entry));
                continue;
            }
            copyFileSync(source, join(staging, entry));
        }
    }
}

/** Copy what a published report is made of, leaving the rest of the directory alone. */
function publishGenerated(stagingOut: string, publishDir: string): void {
    mkdirSync(publishDir, {recursive: true});
    for (const file of ['index.html', 'summary.json']) {
        const source = join(stagingOut, file);
        if (existsSync(source)) copyFileSync(source, join(publishDir, file));
    }
}

export interface IPublishAllureOptions {
    /** Base-branch copy of the committed history, so a re-run does not stack on itself. */
    baseHistory?: string;
    /** Runs a tool, resolving its exit code. Defaults to the shared `runTool`. */
    run?: (command: string, args: string[], cwd: string) => Promise<number>;
}

/**
 * Generate the single Allure report this package publishes, from every producer.
 *
 * Returns without touching anything when no producer left results, and when what is there
 * is older than the report already published for it. The second case is the ordinary one:
 * every package keeps `allure-results` from whichever browser run last happened in it, and
 * regenerating a report for results nothing has touched would cost seconds of Allure on
 * every handler-test run — and publish a stale run as if it were this one.
 *
 * What triggers the regeneration is *any* producer having written something since; what is
 * merged is every producer that has results, because the two producers of one cycle are
 * not written at the same moment: a handler-test run publishes first and the browser run
 * that follows it has to merge what is already there.
 */
export async function publishAllureReport(
    cwd: string,
    options: IPublishAllureOptions = {},
): Promise<IAllurePublishResult> {
    const dirs = resultsDirsOf(cwd);
    if (dirs.length === 0) return {published: false, producers: 0};

    const run = options.run ?? ((command, args, dir) => runTool(command, args, {cwd: dir, env: toolEnv(dir)}));
    const publishDir = join(reportDir(cwd, true), PUBLISH_DIR);
    const publishedAt = publishedMtime(publishDir);
    if (!dirs.some(dir => newestMtime(dir) > publishedAt)) {
        return {published: false, producers: 0};
    }

    const staging = join(cwd, REPORT_DIR, STAGING_DIR);
    const stagingOut = join(staging, 'report');
    rmSync(staging, {recursive: true, force: true});

    try {
        stageResults(cwd, join(staging, 'results'), join(publishDir, 'traces'));

        // The package's slice of the committed history, so Allure appends this run to it
        // and `blong-dev ci-report` can fold the result back into `.github/history.jsonl`.
        const base = options.baseHistory ?? '';
        const history = writeSlice(
            cwd,
            sliceForPackage(
                readHistory(base || historyFile(repoRoot(cwd))),
                packageName(cwd),
            ),
        );

        const exitCode = await run(
            'allure',
            [
                'awesome',
                '--single-file',
                '--history-path',
                history,
                '-o',
                stagingOut,
                join(staging, 'results'),
            ],
            cwd,
        );
        if (exitCode !== 0) return {published: false, producers: dirs.length};

        publishGenerated(stagingOut, publishDir);
        return {
            published: true,
            producers: dirs.length,
            reportDir: ALLURE_PUBLISH_DIR,
        };
    } finally {
        // The staged copies are large and the published report is a single file; nothing
        // here is wanted afterwards, and a stale staging directory would be merged into
        // the next run.
        rmSync(staging, {recursive: true, force: true});
    }
}

/** Kept so a caller can log where a report landed without importing the paths module. */
export const ALLURE_PUBLISH_DIR = join(REPORT_DIR, PUBLISH_DIR);
