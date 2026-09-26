import {copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

import {publishAllureReport} from '../report/allurePublish.ts';
import {
    countTests,
    statusOf,
    type IRunReport,
    type ISuiteEntry,
    type TestStatus,
} from '../report/reportTypes.ts';
import {clearRun, writeRun} from '../report/reportWrite.ts';
import {runTool, type RunOptions} from '../utils/runTool.ts';
import {toolEnv} from '../utils/toolPath.ts';

const blongDevBin = fileURLToPath(new URL('../../node_modules/.bin', import.meta.url));
const PATH_SEP = process.platform === 'win32' ? ';' : ':';

/**
 * Run Playwright tests in the current working directory.
 *
 * Resolves the Playwright CLI from the package's own node_modules first,
 * then falls back to blong-dev's bundled binary.
 *
 * After tests complete, if `allure-results/` exists, automatically generates a
 * single-file Allure HTML report plus the `.ci-report/` contract:
 *
 * - `.ci-report/publish/index.html` — the report published to the reports
 *   repository (with `traces/` next to it)
 * - `.ci-report/report.json` and `.ci-report/summary.md` — the machine and human
 *   readable contract consumed by `blong-dev ci-report`
 * - `.ci-report/history.jsonl` — this package's Allure trend history, seeded
 *   from the committed `.github/history.jsonl` and appended to by Allure
 *
 * When `--coverage` is passed (stripped from Playwright args):
 * - Sets NODE_V8_COVERAGE to collect server-side V8 coverage from web server processes
 * - After tests complete, runs c8 report on the collected coverage data
 * - Coverage output lands in `coverage/` at the repository root
 */
export async function playwright(args: string[]): Promise<void> {
    const cwd = process.cwd();
    const localBin = join(cwd, 'node_modules', '.bin');

    // Check for --coverage flag and strip it from Playwright args
    const collectCoverage = args.includes('--coverage');
    const pwArgs = args.filter(a => a !== '--coverage');

    const coverageDir = join(cwd, '.playwright', 'coverage');
    const v8Dir = join(coverageDir, 'v8');

    const env: NodeJS.ProcessEnv = {
        ...process.env,
        PATH: [localBin, blongDevBin, process.env['PATH'] ?? ''].join(PATH_SEP),
    };

    // When collecting coverage, set NODE_V8_COVERAGE so the blong server process
    // (spawned by Playwright's webServer config) writes V8 coverage on exit.
    if (collectCoverage) {
        // Start from a clean slate so coverage never accumulates across runs:
        // drop leftover V8 dumps and any stale pw-* files from earlier runs.
        rmSync(coverageDir, {recursive: true, force: true});
        mkdirSync(v8Dir, {recursive: true});
        const tapCoverageDir = join(cwd, '.tap', 'coverage');
        if (existsSync(tapCoverageDir)) {
            for (const file of readdirSync(tapCoverageDir)) {
                if (file.startsWith('pw-')) {
                    rmSync(join(tapCoverageDir, file), {force: true});
                }
            }
        }
        env['NODE_V8_COVERAGE'] = v8Dir;
        console.log(`[playwright --coverage] NODE_V8_COVERAGE=${v8Dir}`);
    }

    const run = (cmd: string, runArgs: string[]) =>
        runTool(cmd, runArgs, {cwd, env} satisfies RunOptions);

    // In CI, ensure browsers and system deps are available.
    // The rush.yaml workflow pre-installs and caches browsers, so this is typically a no-op.
    // Skip when PLAYWRIGHT_SKIP_INSTALL is set to avoid parallel dpkg lock contention.
    if (process.env.CI && !process.env.PLAYWRIGHT_SKIP_INSTALL) {
        await run('playwright', ['install', '--with-deps']);
    }

    // Clear stale results from previous runs
    const resultsDir = join(cwd, 'allure-results');
    rmSync(resultsDir, {recursive: true, force: true});
    // This runner's slice of the package report goes with them, and before the run
    // rather than after it: a browser leg that dies before producing results leaves
    // no `writeRun` behind, and the previous cycle's numbers must not be aggregated
    // as this cycle's. The other runners' slices are kept — the file describes the
    // package, and their results belong to the same cycle.
    clearRun('playwright', cwd);

    const exitCode = await run('playwright', ['test', ...pwArgs]);

    // Generate the single-file Allure report published for this package, plus
    // the `.ci-report/` contract consumed by `blong-dev ci-report`. The report is
    // merged from every producer's results, so a package whose handler tests also
    // reported has one document rather than two.
    if (existsSync(resultsDir)) {
        const traceFiles = readdirSync(resultsDir).filter(f => f.endsWith('-attachment.zip'));
        const published = await publishAllureReport(cwd, {
            baseHistory: process.env['CI_BASE_HISTORY'],
            run: (command, args, dir) => runTool(command, args, {cwd: dir, env: toolEnv(dir)}),
        });
        if (published.published) {
            console.log(
                `Allure report: ${published.reportDir} (${published.producers} producer(s))`,
            );
        }

        const parsed = parseResults(resultsDir, traceFiles);
        writeRun(toRun(parsed.tests, parsed.durationMs), cwd);
    }

    // ── Coverage collection ──────────────────────────────────────────────────
    // When --coverage was requested, copy V8 coverage files produced by
    // both the server process (via NODE_V8_COVERAGE) and the browser-side
    // coverage fixture into the invoking package's .tap/coverage/ directory.
    // run-coverage.sh (in blong-gogo) later merges these per-package files,
    // plus gogo's own test coverage, into a clean staging dir for the unified
    // c8 aggregation.
    if (collectCoverage && existsSync(v8Dir)) {
        const v8Files = readdirSync(v8Dir).filter(f => f.endsWith('.json'));
        if (v8Files.length > 0) {
            console.log(
                `\n[playwright --coverage] ${v8Files.length} V8 coverage file(s) found in ${v8Dir}`,
            );

            const tapDir = join(cwd, '.tap', 'coverage');
            mkdirSync(tapDir, {recursive: true});

            let copied = 0;
            for (const file of v8Files) {
                const src = join(v8Dir, file);
                const dst = join(tapDir, `pw-${file}`);
                copyFileSync(src, dst);
                copied++;
            }
            console.log(`[playwright --coverage] Copied ${copied} coverage file(s) to ${tapDir}`);
        } else {
            console.log('[playwright --coverage] No V8 coverage files found');
        }
    }

    process.exitCode = exitCode;
}

interface AllureResult {
    name?: string;
    fullName?: string;
    status?: string;
    testCaseId?: string;
    historyId?: string;
    /** Epoch milliseconds; the run's span is the union of every result's span. */
    start?: number;
    stop?: number;
    labels?: Array<{name: string; value: string}>;
    steps?: Array<{attachments?: Array<{source?: string; type?: string}>}>;
}

interface TestResult {
    name: string;
    suite: string;
    status: string;
    trace?: string;
    durationMs?: number;
    /** Allure's own name for the test, which is what the history is keyed on. */
    fullName?: string;
}

/** The parsed results of a run, plus how long the run itself took. */
interface ParsedResults {
    tests: TestResult[];
    /** Span of the Allure timestamps, i.e. the browser leg's wall clock. */
    durationMs?: number;
}

function parseResults(resultsDir: string, traceFiles: string[]): ParsedResults {
    const traceSet = new Set(traceFiles);

    // Collect all attempts grouped by test identity
    const attempts = new Map<
        string,
        Array<{
            status: string;
            name: string;
            suite: string;
            trace?: string;
            durationMs?: number;
            fullName?: string;
            start?: number;
            stop?: number;
        }>
    >();
    let started: number | undefined;
    let stopped: number | undefined;

    for (const file of readdirSync(resultsDir).filter(f => f.endsWith('-result.json'))) {
        const data = JSON.parse(readFileSync(join(resultsDir, file), 'utf8')) as AllureResult;
        const suite = data.labels?.find(l => l.name === 'suite')?.value ?? '';
        const subSuite = data.labels?.find(l => l.name === 'subSuite')?.value ?? '';
        const name = data.name ?? data.fullName ?? file;
        const status = data.status ?? 'unknown';
        const key = data.testCaseId ?? data.historyId ?? `${suite}/${subSuite}/${name}`;
        // Allure timestamps are epoch milliseconds; a retried test is re-started, so
        // the attempts of one test carry different spans and the run's span is the
        // union of them all.
        const {start, stop} = data;
        if (typeof start === 'number')
            started = started === undefined ? start : Math.min(started, start);
        if (typeof stop === 'number')
            stopped = stopped === undefined ? stop : Math.max(stopped, stop);

        let trace: string | undefined;
        for (const step of data.steps ?? []) {
            for (const att of step.attachments ?? []) {
                if (
                    att.type === 'application/vnd.allure.playwright-trace' &&
                    att.source &&
                    traceSet.has(att.source)
                ) {
                    trace = att.source;
                }
            }
        }

        const group = attempts.get(key) ?? [];
        group.push({
            status,
            name,
            suite: subSuite ? `${suite} › ${subSuite}` : suite,
            trace,
            ...(data.fullName ? {fullName: data.fullName} : {}),
            ...(typeof start === 'number' && typeof stop === 'number' && stop >= start
                ? {durationMs: stop - start, start, stop}
                : {}),
        });
        attempts.set(key, group);
    }

    // Deduplicate: a test with both failed and passed attempts is flaky
    const results: TestResult[] = [];
    for (const group of attempts.values()) {
        const hasFailed = group.some(a => a.status === 'failed' || a.status === 'broken');
        const hasPassed = group.some(a => a.status === 'passed');
        const status = hasFailed && hasPassed ? 'flaky' : hasFailed ? 'failed' : group[0]!.status;
        // Use the trace from the failed attempt (most useful for debugging)
        const trace = group.find(a => a.trace)?.trace;
        // The slowest attempt, which is what a timeout budget has to cover.
        const slowest = group.reduce((worst, attempt) =>
            (attempt.durationMs ?? 0) > (worst.durationMs ?? 0) ? attempt : worst,
        );
        results.push({
            name: group[0]!.name,
            suite: group[0]!.suite,
            status,
            trace,
            ...(group[0]!.fullName ? {fullName: group[0]!.fullName} : {}),
            ...(typeof slowest.durationMs === 'number' ? {durationMs: slowest.durationMs} : {}),
        });
    }

    results.sort((a, b) => {
        const order = (s: string) => (s === 'failed' || s === 'broken' ? 0 : s === 'flaky' ? 1 : 2);
        if (order(a.status) !== order(b.status)) return order(a.status) - order(b.status);
        return (a.suite + a.name).localeCompare(b.suite + b.name);
    });

    return {
        tests: results,
        ...(started !== undefined && stopped !== undefined && stopped >= started
            ? {durationMs: stopped - started}
            : {}),
    };
}

/**
 * Convert parsed Allure results into the `.ci-report/` contract.
 *
 * The Allure `suite › subSuite` label becomes the suite, and each test keeps
 * its trace name so the failures bundle can link straight at it.
 */
function toRun(results: TestResult[], durationMs?: number): IRunReport {
    const suites: ISuiteEntry[] = [];
    for (const result of results) {
        const name = result.suite || '(unknown suite)';
        let suite = suites.find(candidate => candidate.name === name);
        if (!suite) {
            suite = {name, status: 'unknown', counts: countTests([]), tests: []};
            suites.push(suite);
        }
        suite.tests.push({
            name: result.name,
            status: toStatus(result.status),
            ...(result.fullName ? {fullName: result.fullName} : {}),
            ...(typeof result.durationMs === 'number' ? {durationMs: result.durationMs} : {}),
            ...(result.trace
                ? {
                      trace: result.trace,
                      attachments: [{name: 'trace', file: `traces/${result.trace}`}],
                  }
                : {}),
        });
    }
    for (const suite of suites) {
        suite.counts = countTests(suite.tests);
        suite.status = statusOf(suite.counts);
    }

    const counts = countTests(suites.flatMap(suite => suite.tests));
    return {
        runner: 'playwright',
        status: statusOf(counts),
        counts,
        ...(typeof durationMs === 'number' ? {durationMs} : {}),
        generatedAt: new Date().toISOString(),
        suites,
    };
}

function toStatus(status: string): TestStatus {
    switch (status) {
        case 'passed':
        case 'failed':
        case 'broken':
        case 'flaky':
        case 'skipped':
        case 'todo':
            return status;
        default:
            return 'unknown';
    }
}
