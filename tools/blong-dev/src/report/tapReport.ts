/**
 * Runs the package's tap suite, prints a compact failure view and writes the
 * `<pkg>/.ci-report/` contract.
 *
 * tap's default reporter echoes every passing assertion and dumps a large
 * diagnostics block per failure, which makes the CI log unreadable. We ask tap
 * for its structured `json` report instead, keep it verbatim in
 * `.ci-report/tap.json` (uploaded as an artifact) and print only the failures
 * plus a one-line summary. `blong-dev test --reporter=base` hands stdio back to
 * tap; in that case no report is written, because the output is no longer
 * machine readable.
 */

import {spawn, type ChildProcess} from 'node:child_process';
import {createWriteStream, existsSync, readFileSync, writeFileSync} from 'node:fs';

import {packageName, reportPath} from './reportPaths.ts';
import {
    countTests,
    statusOf,
    type IRunReport,
    type ISuiteEntry,
    type ITestEntry,
    type TestStatus,
} from './reportTypes.ts';
import {clearRun, writeRun} from './reportWrite.ts';

/** Maximum number of failure details printed to the console. */
const MAX_CONSOLE_DETAILS = 10;

/** Maximum characters of a failure message printed to the console. */
const MAX_MESSAGE_CHARS = 400;

/** Maximum number of captured lines dumped when the TAP stream is unusable. */
const MAX_FALLBACK_LINES = 40;

/**
 * File inside `.ci-report/` holding the raw TAP stream of the last run.
 *
 * The raw stream is what carries the test process's own records — the framework
 * logs a suite prints — because the reporter's JSON does not include them. It is
 * also tap's own view of the run: the `ok`/`not ok` tree with `# Subtest:`
 * nesting. A watched run echoes it; a captured one keeps it as an artifact.
 */
const RAW_TAP_FILE = 'tap.raw.tap';

/** File inside `.ci-report/` holding tap's structured report. */
const TAP_JSON_FILE = 'tap.json';

/**
 * The flag that asks a dev run for the structured report instead of the live view.
 *
 * A run has one reporter, so a dev run is the live one — which is what a person watching
 * wants — and this is how a tool or an agent asks for the other, making a dev run behave
 * exactly as CI does.
 */
export const REPORT_FLAG = '--report';

interface ITapLocation {
    fileName?: string;
    lineNumber?: number;
    columnNumber?: number;
}

interface ITapDiagnostics {
    message?: string;
    stack?: string;
    source?: string;
    diff?: string;
    compare?: string;
    stdio?: string;
    exitCode?: number;
    at?: ITapLocation;
}

interface ITapCase {
    ok?: boolean;
    name?: string;
    fullname?: string;
    skip?: unknown;
    todo?: unknown;
    diag?: ITapDiagnostics;
}

interface ITapSuite {
    name?: string;
    level?: number;
    ok?: boolean;
    time?: number;
    failures?: number;
    assertions?: number;
    /** Present on every suite; `skipAll` marks an *empty plan*, not a skipped test. */
    plan?: {start?: number; end?: number; skipAll?: boolean};
    /** Counts the suite's own skipped children, `skipAll` ones included. */
    skipped?: number;
    skip?: unknown;
    todo?: unknown;
    diag?: ITapDiagnostics;
    suites?: ITapSuite[];
    cases?: ITapCase[];
}

/** The subset of tap's `--reporter=json` output this module relies on. */
export interface ITapJsonReport {
    name?: string;
    tests?: number;
    failures?: number;
    assertions?: number;
    /** Counts skipped tests — and `failures` counts them too, see the note below. */
    skipped?: number;
    suites?: ITapSuite[];
}

/** Parse tap's `--reporter=json` output, resolving `null` when it is unusable. */
export function parseTapJson(stdout: string): ITapJsonReport | null {
    const start = stdout.indexOf('{');
    const end = stdout.lastIndexOf('}');
    const candidates = [stdout];
    if (start >= 0 && end > start) candidates.push(stdout.slice(start, end + 1));
    for (const candidate of candidates) {
        try {
            return JSON.parse(candidate) as ITapJsonReport;
        } catch {
            // tap can interleave diagnostics around the JSON payload; try next.
        }
    }
    return null;
}

/** Human readable message for a failing assertion or suite. */
function failureMessage(diag: ITapDiagnostics | undefined): string | undefined {
    if (!diag) return undefined;
    if (diag.message) return diag.message;
    const parts: string[] = [];
    if (diag.compare) parts.push(`assertion failed (${diag.compare})`);
    if (diag.stdio) parts.push(`test process exited with code ${diag.exitCode ?? 'unknown'}`);
    if (diag.diff) parts.push(diag.diff.trimEnd());
    return parts.length > 0 ? parts.join('\n') : undefined;
}

function locationOf(diag: ITapDiagnostics | undefined): Pick<ITestEntry, 'file' | 'line'> {
    const at = diag?.at;
    if (!at?.fileName) return {};
    return at.lineNumber ? {file: at.fileName, line: at.lineNumber} : {file: at.fileName};
}

function statusOfCase(entry: ITapCase): TestStatus {
    if (entry.skip) return 'skipped';
    if (entry.todo) return 'todo';
    return entry.ok === false ? 'failed' : 'passed';
}

/** Status of a subtest that emitted no assertions of its own. */
function statusOfSuite(suite: ITapSuite): TestStatus {
    if (suite.todo) return 'todo';
    if (suite.skip) return 'skipped';
    return suite.ok === false ? 'failed' : 'passed';
}

/**
 * Flatten one tap suite subtree into leaf test entries.
 *
 * Returns the number of failing leaves found, so a suite that failed without a
 * failing assertion (crash, timeout, plan mismatch) can be reported as well.
 */
/**
 * tap times suites and subtests in milliseconds, and nothing else.
 *
 * A *subtest* — what the blong runtime's handler tests are, and what a `t.test(...)`
 * group is — carries its own time. An assertion inside a group (`cases`) does not, so
 * a test that only ever asserted gets no duration rather than its group's total, which
 * would credit it with time its siblings spent.
 */
function timingOf(suite: ITapSuite): {durationMs?: number} {
    return typeof suite.time === 'number' ? {durationMs: suite.time} : {};
}

function collectSuite(
    suite: ITapSuite,
    groups: string[],
    out: ITestEntry[],
    includeName = true,
): number {
    const suiteName = suite.name ?? '';
    const name = includeName ? suiteName : '';
    const childGroups = name ? [...groups, name] : groups;
    let failures = 0;

    const children = suite.suites ?? [];
    const cases = suite.cases ?? [];

    for (const child of children) failures += collectSuite(child, childGroups, out);

    for (const entry of cases) {
        const status = statusOfCase(entry);
        if (status === 'failed') failures += 1;
        out.push({
            name: [...childGroups, entry.name ?? '(unnamed assert)'].join(' › '),
            status,
            ...locationOf(entry.diag),
            message: failureMessage(entry.diag),
            stack: entry.diag?.stack,
        });
    }

    // A subtest with nothing underneath it is a test in its own right. The blong
    // runtime nests its handler tests exactly this way and asserts nothing
    // inside them, so tap records an *empty plan* — `plan.skipAll` with
    // `ok: true`, which its own TAP reporter still prints as `ok N - <name>` and
    // which really did execute (the JSON even carries its duration). Treating
    // that as "not a test" silently dropped every realm test from the report;
    // treating it as skipped would report thousands of tests as skipped that
    // tap itself calls `ok`. Only an explicit `skip`/`todo` marker means the
    // test never ran.
    const isLeaf = children.length === 0 && cases.length === 0;
    if (includeName && isLeaf) {
        const status = statusOfSuite(suite);
        if (status === 'failed') failures += 1;
        out.push({
            name: childGroups.join(' › ') || suiteName || '(suite)',
            status,
            ...timingOf(suite),
            ...locationOf(suite.diag),
            message:
                status === 'failed' ? (failureMessage(suite.diag) ?? 'suite failed') : undefined,
            stack: suite.diag?.stack,
        });
    } else if (suite.ok === false && failures === 0) {
        // A test file that died before emitting anything, or a group that failed
        // without any failing child (plan mismatch, coverage gate). A file-level
        // suite has no group path of its own, so it falls back to its name (the
        // test file), which is what the report shows.
        failures += 1;
        out.push({
            name: childGroups.join(' › ') || suiteName || '(suite)',
            status: 'failed',
            ...timingOf(suite),
            ...locationOf(suite.diag),
            message: failureMessage(suite.diag) ?? 'suite failed',
            stack: suite.diag?.stack,
        });
    }

    return failures;
}

/**
 * Build the `IReport` for a completed tap run.
 *
 * `exitCode` is tap's own verdict and the only trustworthy failure signal: the
 * `failures` field of its JSON report counts skipped tests as failures (a file
 * with two skips reports `failures: 2`, `skipped: 2` and still exits 0), so it
 * cannot be used to detect a failure the report failed to describe.
 */
export function buildTapRun(
    tap: ITapJsonReport | null,
    exitCode: number,
    durationMs?: number,
): IRunReport {
    const suites: ISuiteEntry[] = [];
    for (const file of tap?.suites ?? []) {
        const tests: ITestEntry[] = [];
        // The file name is the suite, so it is not repeated in every test name.
        collectSuite(file, [], tests, false);
        const counts = countTests(tests);
        suites.push({
            name: file.name ?? '(unnamed suite)',
            file: file.name,
            status: statusOf(counts),
            counts,
            tests,
        });
    }

    // Defensive: a failing run that names no failing test (an aborted file, a
    // subprocess tap never saw) must not be reported as green.
    if (exitCode !== 0 && !suites.some(suite => suite.counts.failed > 0)) {
        const tests: ITestEntry[] = [
            {
                name: `tap exited with code ${exitCode} without reporting a failing test`,
                status: 'failed',
            },
        ];
        suites.push({name: '(unparsed)', status: 'failed', counts: countTests(tests), tests});
    }

    const counts = countTests(suites.flatMap(suite => suite.tests));
    return {
        runner: 'tap',
        status: statusOf(counts),
        counts,
        durationMs,
        generatedAt: new Date().toISOString(),
        suites,
    };
}

/** Render the compact console view of a completed tap run. */
export function renderTapConsole(run: IRunReport, pkg: string): string {
    const lines: string[] = [];
    const problems: ITestEntry[] = [];
    for (const suite of run.suites) {
        for (const test of suite.tests) {
            if (test.status === 'failed' || test.status === 'broken' || test.status === 'flaky') {
                problems.push(test);
            }
        }
    }

    for (const test of problems.slice(0, MAX_CONSOLE_DETAILS)) {
        const location = test.file ? `${test.file}${test.line ? `:${test.line}` : ''}` : '';
        const message = test.message?.split('\n')[0]?.slice(0, MAX_MESSAGE_CHARS) ?? '';
        lines.push(`✖ ${test.name}${location ? `  (${location})` : ''}`);
        if (message) lines.push(`    ${message}`);
    }
    if (problems.length > MAX_CONSOLE_DETAILS) {
        lines.push(`✖ … ${problems.length - MAX_CONSOLE_DETAILS} more failure(s), see the report`);
    }

    lines.push(
        `# ${pkg}: ${run.counts.passed} passed, ${run.counts.failed} failed` +
            `${run.counts.flaky > 0 ? `, ${run.counts.flaky} flaky` : ''}` +
            `${run.counts.skipped > 0 ? `, ${run.counts.skipped} skipped` : ''} ` +
            `(${run.counts.total} total)`,
    );
    lines.push(
        `# raw report: ${reportPath('.', 'tap.json')}, structured: ${reportPath('.', 'report.json')}`,
    );
    return lines.join('\n');
}

/** True when the caller asked for a specific tap reporter, i.e. wants raw output. */
export function hasCustomReporter(args: readonly string[]): boolean {
    return args.some(arg => arg === '--reporter' || arg.startsWith('--reporter=') || arg === '-R');
}

/**
 * Environment for the child tap process, with inherited tap configuration
 * removed when this run is itself nested inside another tap process.
 *
 * tap exports its resolved configuration into every process it spawns —
 * `TAP_REPORTER`, `TAP_JOBS`, `TAP_CWD`, `TAP_INCLUDE`, and the child markers
 * `TAP_CHILD_ID`/`TAP_JOB_ID` among them. A suite that runs another package's
 * tests (blong-kukum's end-to-end suite runs the fixture realm exactly like
 * this) therefore hands its own configuration to the nested run: the nested tap
 * sees the child markers, concludes it is a child of the outer run, **ignores
 * the reporter it was asked for** and prints plain TAP, and `TAP_CWD`/`TAP_INCLUDE`
 * point at the calling package rather than at the package being tested. Dropping
 * the inherited configuration makes a nested run behave like a standalone one,
 * which is what its caller asked for: a report for the package it ran in.
 */
/**
 * Whether this run is itself inside another tap run.
 *
 * tap marks its descendants with `TAP`/`TAP_CHILD_ID`/`TAP_JOB_ID`, and the recorded
 * artifacts of a run belong to the process that started it: a nested run that replayed
 * the stream would rewrite the parent's own recording.
 */
function isNestedRun(env: NodeJS.ProcessEnv): boolean {
    return Boolean(env['TAP'] ?? env['TAP_CHILD_ID'] ?? env['TAP_JOB_ID']);
}

function childEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
    if (!isNestedRun(env)) return env;
    return Object.fromEntries(
        Object.entries(env).filter(([name]) => name !== 'TAP' && !name.startsWith('TAP_')),
    );
}
/**
 * Whether this run is watched rather than captured.
 *
 * A watched run is driven by tap's own reporter, live, because that is what tells a
 * person something is happening: a long step is visible while it runs instead of
 * appearing at the end with its duration, which is exactly when a run that waited too
 * long for something is worth noticing. A captured run (CI) stays quiet and keeps the
 * artifacts.
 */
export function isWatchedRun(env: NodeJS.ProcessEnv): boolean {
    return !env['CI'];
}

/**
 * The tap argument list for a run.
 *
 * A captured run is asked for the structured report and told to write it straight to
 * `tap.json` with `--reporter-file`, so this module never holds it; its raw TAP stream
 * goes to its artifact with `--output-file`, which is the only thing carrying the test
 * process's own records — the JSON report does not include them.
 *
 * A watched run is given neither: its reporter is tap's own, which is the live view, and
 * `--output-file` is left out because tap echoes the child's stream twice when it is set.
 * Its artifact is written from that live stream instead, so the report a tool reads there
 * is the TAP itself.
 */
export function tapInvocation(
    jsonPath: string,
    rawPath: string,
    args: string[],
    watched = false,
): string[] {
    if (watched) return [...args];
    return ['--reporter=json', `--reporter-file=${jsonPath}`, `--output-file=${rawPath}`, ...args];
}

/** Read a file, or `undefined` when a run never wrote it. */
function readIfPresent(path: string): string | undefined {
    return existsSync(path) ? readFileSync(path, 'utf8') : undefined;
}

/**
 * Run tap in the current package.
 *
 * Returns the tap exit code. When `args` selects a custom reporter the child
 * inherits stdio and no report is produced.
 *
 * A watched run (a dev run, unless `--report` asks otherwise) is driven by tap's own
 * reporter and its output is relayed as it arrives, which is what tells a person
 * something is happening: a long step is visible while it runs instead of appearing at
 * the end with its duration, and a step that waited too long is noticeable while it is
 * still waiting. That stream is written to `tap.raw.tap` as it comes — the machine
 * readable artifact of a watched run.
 *
 * A captured run (CI, or `--report`) is asked for the structured report instead, which
 * only a captured run can have: tap prints a live report and a JSON one through the same
 * reporter, so one run is one of the two. It prints the failure view and nothing else.
 */
export async function runTap(args: string[], cwd: string, env: NodeJS.ProcessEnv): Promise<number> {
    const spawnEnv = childEnv(env);
    if (hasCustomReporter(args)) {
        // The caller asked for its own reporter, so it owns reporting entirely: this
        // run neither writes the package report nor clears a slice of it.
        return new Promise((resolve, reject) => {
            const child = spawn('tap', args, {stdio: 'inherit', cwd, env: spawnEnv});
            child.on('error', reject);
            child.on('close', code => resolve(code ?? 0));
        });
    }

    const started = Date.now();
    const jsonPath = reportPath(cwd, TAP_JSON_FILE, true);
    const rawPath = reportPath(cwd, RAW_TAP_FILE);
    // `--report` is this tool's own flag, not tap's: it asks a dev run for the report
    // instead of the live view, which is what CI gets anyway.
    const captured = !isWatchedRun(spawnEnv) || args.includes(REPORT_FLAG);
    if (captured) {
        // This runner's slice of the package report is dropped before tap starts, so a
        // run that dies mid-way leaves no previous tap report to be aggregated as this
        // one's — and the other runners' slices are kept, because a package can run more
        // than one in a cycle. A watched dev run writes no report, so it must not clear
        // one either: that would leave the package described by its other runners alone.
        clearRun('tap', cwd);
    }
    const tapArgs = args.filter(arg => arg !== REPORT_FLAG);
    let stderr = '';

    const exitCode = await new Promise<number>((resolve, reject) => {
        const child: ChildProcess = spawn(
            'tap',
            tapInvocation(jsonPath, rawPath, tapArgs, !captured),
            {
                cwd,
                env: spawnEnv,
                stdio: ['inherit', 'pipe', 'pipe'],
            },
        );
        // A watched run is relayed and written out as it arrives, so the terminal shows
        // the run while it happens and the artifact is the same stream. A captured run's
        // artifacts are files tap writes itself.
        const sink = captured ? undefined : createWriteStream(rawPath);
        child.stdout?.setEncoding('utf8');
        child.stderr?.setEncoding('utf8');
        child.stdout?.on('data', (chunk: string) => {
            sink?.write(chunk);
            process.stdout.write(chunk);
        });
        child.stderr?.on('data', (chunk: string) => {
            stderr += chunk;
            process.stderr.write(chunk);
        });
        child.on('error', reject);
        child.on('close', code => {
            sink?.end();
            resolve(code ?? 0);
        });
    });

    if (stderr.trim() !== '') writeFileSync(reportPath(cwd, 'tap-stderr.txt'), stderr);

    if (!captured) {
        // Nothing to summarise: the run has just been printed, failure lines and all.
        process.stdout.write(
            `# ${RAW_TAP_FILE} has this run's output; the structured report is a captured run's (CI, or \`blong-dev test --report\`)\n`,
        );
        return exitCode;
    }

    const raw = readIfPresent(jsonPath) ?? '';
    const parsed = parseTapJson(raw);
    const run = buildTapRun(parsed, exitCode, Date.now() - started);
    writeRun(run, cwd);

    if (parsed === null) {
        // tap never produced a report (crash, compile error, kill): show the tail
        // of what it did produce, so the log stays diagnosable, then point at the
        // artifacts. Only a captured run gets here — a watched one has already
        // printed the whole stream.
        const tail = [raw, stderr]
            .filter(text => text.trim() !== '')
            .map(text => text.split('\n').slice(-MAX_FALLBACK_LINES).join('\n').trimEnd())
            .join('\n');
        if (tail) process.stdout.write(tail + '\n');
        process.stdout.write(
            `# tap produced no report that could be parsed; raw output: ${reportPath('.', TAP_JSON_FILE)}\n`,
        );
    } else {
        process.stdout.write(renderTapConsole(run, packageName(cwd)) + '\n');
    }

    return exitCode;
}
