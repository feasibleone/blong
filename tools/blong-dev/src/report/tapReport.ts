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

import {spawn} from 'node:child_process';
import {writeFileSync} from 'node:fs';

import {packageName, packageRelPath, reportPath} from './reportPaths.ts';
import {
    countTests,
    statusOf,
    type IReport,
    type ISuiteEntry,
    type ITestEntry,
    type TestStatus,
} from './reportTypes.ts';
import {writeReport} from './reportWrite.ts';

/** Maximum number of failure details printed to the console. */
const MAX_CONSOLE_DETAILS = 10;

/** Maximum characters of a failure message printed to the console. */
const MAX_MESSAGE_CHARS = 400;

/** Maximum number of captured lines dumped when the TAP stream is unusable. */
const MAX_FALLBACK_LINES = 40;

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
    diag?: ITapDiagnostics;
    suites?: ITapSuite[];
    cases?: ITapCase[];
}

/** The subset of tap's `--reporter=json` output this module relies on. */
export interface ITapJsonReport {
    name?: string;
    failures?: number;
    assertions?: number;
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

/**
 * Flatten one tap suite subtree into leaf test entries.
 *
 * Returns the number of failing leaves found, so a suite that failed without a
 * failing assertion (crash, timeout, plan mismatch) can be reported as well.
 */
function collectSuite(suite: ITapSuite, groups: string[], out: ITestEntry[], includeName = true): number {
    const suiteName = suite.name ?? '';
    const name = includeName ? suiteName : '';
    const childGroups = name ? [...groups, name] : groups;
    let failures = 0;

    for (const child of suite.suites ?? []) failures += collectSuite(child, childGroups, out);

    for (const entry of suite.cases ?? []) {
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

    if (suite.ok === false && failures === 0) {
        failures += 1;
        out.push({
            // A file-level suite has no group path of its own, so it falls back
            // to its name (the test file), which is what the report shows.
            name: childGroups.join(' › ') || suiteName || '(suite)',
            status: 'failed',
            ...locationOf(suite.diag),
            message: failureMessage(suite.diag) ?? 'suite failed',
            stack: suite.diag?.stack,
        });
    }

    return failures;
}

/** Build the `IReport` for a completed tap run. */
export function buildTapReport(
    tap: ITapJsonReport | null,
    pkg: string,
    path: string,
    durationMs?: number,
): IReport {
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

    // Defensive: never report a green run when tap itself counted failures.
    if (!suites.some(suite => suite.counts.failed > 0) && (tap?.failures ?? 0) > 0) {
        const tests: ITestEntry[] = [
            {name: `tap reported ${tap?.failures} failure(s) absent from its JSON report`, status: 'failed'},
        ];
        suites.push({name: '(unparsed)', status: 'failed', counts: countTests(tests), tests});
    }

    const counts = countTests(suites.flatMap(suite => suite.tests));
    return {
        schema: 1,
        package: pkg,
        path,
        runner: 'tap',
        status: statusOf(counts),
        counts,
        durationMs,
        generatedAt: new Date().toISOString(),
        suites,
    };
}

/** Render the compact console view of a completed tap run. */
export function renderTapConsole(report: IReport): string {
    const lines: string[] = [];
    const problems: ITestEntry[] = [];
    for (const suite of report.suites) {
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
        `# ${report.package}: ${report.counts.passed} passed, ${report.counts.failed} failed` +
            `${report.counts.flaky > 0 ? `, ${report.counts.flaky} flaky` : ''}` +
            `${report.counts.skipped > 0 ? `, ${report.counts.skipped} skipped` : ''} ` +
            `(${report.counts.total} total)`,
    );
    lines.push(`# raw report: ${reportPath('.', 'tap.json')}, structured: ${reportPath('.', 'report.json')}`);
    return lines.join('\n');
}

/** True when the caller asked for a specific tap reporter, i.e. wants raw output. */
export function hasCustomReporter(args: readonly string[]): boolean {
    return args.some(arg => arg === '--reporter' || arg.startsWith('--reporter=') || arg === '-R');
}

/**
 * Run tap in the current package.
 *
 * Returns the tap exit code. When `args` selects a custom reporter the child
 * inherits stdio and no report is produced.
 */
export async function runTap(args: string[], cwd: string, env: NodeJS.ProcessEnv): Promise<number> {
    if (hasCustomReporter(args)) {
        return new Promise((resolve, reject) => {
            const child = spawn('tap', args, {stdio: 'inherit', cwd, env});
            child.on('error', reject);
            child.on('close', code => resolve(code ?? 0));
        });
    }

    const started = Date.now();
    let stdout = '';
    let stderr = '';

    const exitCode = await new Promise<number>((resolve, reject) => {
        const child = spawn('tap', ['--reporter=json', ...args], {
            cwd,
            env,
            stdio: ['inherit', 'pipe', 'pipe'],
        });
        child.stdout.setEncoding('utf8');
        child.stderr.setEncoding('utf8');
        // tap writes the structured report to stdout; anything on stderr is a
        // genuine runner message, so it is forwarded live and kept in the artifact.
        child.stdout.on('data', (chunk: string) => {
            stdout += chunk;
        });
        child.stderr.on('data', (chunk: string) => {
            stderr += chunk;
            process.stderr.write(chunk);
        });
        child.on('error', reject);
        child.on('close', code => resolve(code ?? 0));
    });

    writeFileSync(reportPath(cwd, 'tap.json', true), stdout);
    if (stderr.trim() !== '') writeFileSync(reportPath(cwd, 'tap-stderr.txt'), stderr);

    const report = buildTapReport(
        parseTapJson(stdout),
        packageName(cwd),
        packageRelPath(cwd),
        Date.now() - started,
    );
    writeReport(report, cwd);

    if (report.counts.total === 0 && exitCode !== 0) {
        // tap never produced a report (crash, compile error, kill): show the tail
        // so the CI log stays diagnosable, then point at the artifact.
        const tail = [stdout, stderr]
            .filter(text => text.trim() !== '')
            .map(text => text.split('\n').slice(-MAX_FALLBACK_LINES).join('\n').trimEnd())
            .join('\n');
        if (tail) process.stdout.write(tail + '\n');
        process.stdout.write(`# tap produced no report that could be parsed; raw output: ${reportPath('.', 'tap.json')}\n`);
    } else {
        process.stdout.write(renderTapConsole(report) + '\n');
    }

    return exitCode;
}
