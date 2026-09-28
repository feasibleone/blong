/**
 * Unit tests for the workspace-wide report collection (report/aggregate.ts).
 *
 * `collectReports` reads every package's `.ci-report/report.json` and the
 * aggregate walks `runs` in each. The multi-runner report introduced `runs`, but
 * a file written before it still says `schema: 1`, so it passed the schema check
 * and threw `report.runs is not iterable` with nothing naming the file (T-168).
 * The guard under test skips such a file, names it for the caller, and keeps the
 * reports that are current.
 */

import {mkdirSync, mkdtempSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

import {test} from 'tap';

import {collectReports} from './aggregate.ts';
import {REPORT_DIR} from './reportPaths.ts';
import type {IReport} from './reportTypes.ts';

/** A report in the current, multi-runner shape. */
function currentReport(packageName: string, path: string): IReport {
    return {
        schema: 1,
        package: packageName,
        path,
        status: 'passed',
        counts: {total: 1, passed: 1, failed: 0, flaky: 0, skipped: 0, todo: 0},
        generatedAt: '2026-01-01T00:00:00.000Z',
        runs: [
            {
                runner: 'tap',
                status: 'passed',
                counts: {total: 1, passed: 1, failed: 0, flaky: 0, skipped: 0, todo: 0},
                generatedAt: '2026-01-01T00:00:00.000Z',
                suites: [],
            },
        ],
    };
}

/** A fake repository root whose `rush.json` lists the given projects. */
function fakeRoot(projects: ReadonlyArray<{packageName: string; projectFolder: string}>): string {
    const root = mkdtempSync(join(tmpdir(), 'blong-dev-aggregate-'));
    writeFileSync(join(root, 'rush.json'), JSON.stringify({projects}, null, 2));
    return root;
}

/** Write one package's report file under a fake root. */
function writeReport(root: string, projectFolder: string, report: unknown): void {
    const dir = join(root, projectFolder, REPORT_DIR);
    mkdirSync(dir, {recursive: true});
    writeFileSync(join(dir, 'report.json'), JSON.stringify(report, null, 2));
}

test('collectReports skips a stale report and names the file', t => {
    const root = fakeRoot([
        {packageName: '@fake/current', projectFolder: 'realm/current'},
        {packageName: '@fake/stale', projectFolder: 'demo/stale'},
    ]);
    writeReport(root, 'realm/current', currentReport('current', 'realm/current'));
    // The pre-`runs` shape: the same schema, with `suites` at the top level.
    writeReport(root, 'demo/stale', {
        schema: 1,
        package: 'stale',
        path: 'demo/stale',
        status: 'passed',
        counts: {total: 1, passed: 1, failed: 0, flaky: 0, skipped: 0, todo: 0},
        generatedAt: '2026-01-01T00:00:00.000Z',
        suites: [],
    });

    const stale: string[] = [];
    const reports = collectReports(root, file => stale.push(file));

    t.equal(reports.length, 1, 'only the current report is collected');
    t.equal(reports[0]?.package, 'current', 'and it is the one that carries `runs`');
    t.equal(stale.length, 1, 'the stale file is reported once');
    t.match(stale[0] ?? '', /demo[\\/]stale/, 'the report names the offending file');
    t.end();
});

test('collectReports keeps a report whose runs list is empty', t => {
    const root = fakeRoot([{packageName: '@fake/empty', projectFolder: 'realm/empty'}]);
    writeReport(root, 'realm/empty', {...currentReport('empty', 'realm/empty'), runs: []});

    const stale: string[] = [];
    const reports = collectReports(root, file => stale.push(file));

    t.equal(reports.length, 1, 'an empty runs list is still a current report');
    t.equal(stale.length, 0, 'and it is not reported as stale');
    t.end();
});
