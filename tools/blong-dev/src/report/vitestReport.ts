/**
 * Converts vitest's `--reporter=json` output into the `.ci-report/` contract.
 *
 * vitest runs are driven by `npm run ci-test` in each vitest-based package
 * (`core/blong-browser` today); this module is the only place that knows the
 * shape of `coverage/vitest.json`.
 *
 * jest writes the same document, so {@link buildJestShapedRun} is shared with the legs that
 * are jest underneath — `blong-dev report jest` names them with their own runner name.
 */

import {existsSync, readFileSync} from 'node:fs';
import {join} from 'node:path';

import {repoRoot} from './reportPaths.ts';
import {
    countTests,
    statusOf,
    type IRunReport,
    type ISuiteEntry,
    type ITestEntry,
    type TestStatus,
} from './reportTypes.ts';

interface IVitestAssertion {
    status?: string;
    title?: string;
    fullName?: string;
    duration?: number;
    failureMessages?: string[];
    ancestorTitles?: string[];
    location?: {line?: number; column?: number};
}

interface IVitestFile {
    name?: string;
    status?: string;
    message?: string;
    assertionResults?: IVitestAssertion[];
}

export interface IVitestJson {
    numTotalTests?: number;
    numPassedTests?: number;
    numFailedTests?: number;
    numPendingTests?: number;
    numTodoTests?: number;
    testResults?: IVitestFile[];
}

/** Default location of the raw vitest json report inside a package. */
export const VITEST_JSON = join('coverage', 'vitest.json');

export function readVitestJson(file: string): IVitestJson | null {
    if (!existsSync(file)) return null;
    try {
        return JSON.parse(readFileSync(file, 'utf8')) as IVitestJson;
    } catch {
        return null;
    }
}

function toStatus(status: string | undefined): TestStatus {
    switch (status) {
        case 'passed':
        case 'failed':
        case 'skipped':
            return status;
        case 'pending':
            return 'skipped';
        case 'todo':
        case 'disabled':
            return 'todo';
        default:
            return 'unknown';
    }
}

function testEntry(assertion: IVitestAssertion): ITestEntry {
    const groups = (assertion.ancestorTitles ?? []).filter(title => title !== '');
    const title = assertion.title ?? assertion.fullName ?? '(unnamed test)';
    const failures = (assertion.failureMessages ?? []).filter(message => message.trim() !== '');
    const entry: ITestEntry = {
        name: [...groups, title].join(' › '),
        status: toStatus(assertion.status),
    };
    if (typeof assertion.duration === 'number') entry.durationMs = Math.round(assertion.duration);
    if (failures.length > 0) entry.message = failures.join('\n\n');
    if (typeof assertion.location?.line === 'number') entry.line = assertion.location.line;
    return entry;
}

/** Build the `IRunReport` for a completed vitest run. */
export function buildVitestRun(vitest: IVitestJson | null, cwd: string): IRunReport {
    return buildJestShapedRun(vitest, 'vitest', cwd);
}

/**
 * Build a run slice from jest-shaped JSON, under the name of the leg that produced it.
 *
 * The runner name is the caller's because the *leg*, not the library, is what a reader of
 * the report needs to see: `test-storybook` is jest, and a slice called `jest` in
 * `tools/blong-log` would not say which leg failed. Before this, that leg's result lived
 * only in its own log, so a failure there left the package reading as passed in the
 * aggregate, the metrics and the failures bundle (@@F-539).
 */
export function buildJestShapedRun(
    json: IVitestJson | null,
    runner: string,
    cwd: string,
): IRunReport {
    const root = repoRoot(cwd);
    const suites: ISuiteEntry[] = [];

    for (const file of json?.testResults ?? []) {
        const name = file.name ? file.name.replace(root + '/', '') : '(unknown file)';
        const tests: ITestEntry[] = [];
        if (file.message?.trim()) {
            // A file that never produced assertions (import error, syntax error).
            tests.push({
                name: `${name} — test file failed to run`,
                status: 'failed',
                message: file.message,
            });
        }
        for (const assertion of file.assertionResults ?? []) {
            const entry = testEntry(assertion);
            entry.file = name;
            tests.push(entry);
        }
        const counts = countTests(tests);
        suites.push({name, file: name, status: statusOf(counts), counts, tests});
    }

    const counts = countTests(suites.flatMap(suite => suite.tests));
    return {
        runner,
        status: statusOf(counts),
        counts,
        generatedAt: new Date().toISOString(),
        suites,
    };
}
