import {existsSync} from 'node:fs';
import {join, resolve} from 'node:path';

import {describeAllurePublish, publishAllureReport} from '../report/allurePublish.ts';
import {packageName} from '../report/reportPaths.ts';
import {countTests, statusOf, type ITestEntry} from '../report/reportTypes.ts';
import {clearRun, writeRun} from '../report/reportWrite.ts';
import {VITEST_JSON, buildJestShapedRun, readVitestJson} from '../report/vitestReport.ts';

/** Default input of `report jest`: what a leg writes with `jest --json --outputFile`. */
const JEST_JSON = join('.ci-report', 'jest.json');

/** Read `--flag value` or `--flag=value` from a positional argument list. */
function readFlag(args: readonly string[], flag: string): string | undefined {
    for (let index = 0; index < args.length; index += 1) {
        const arg = args[index]!;
        if (arg === flag) return args[index + 1];
        if (arg.startsWith(`${flag}=`)) return arg.slice(flag.length + 1);
    }
    return undefined;
}

/** The leg's own exit code, when the caller passed one. */
function readExitCode(args: readonly string[]): number | undefined {
    const raw = readFlag(args, '--status');
    if (raw === undefined) return undefined;
    const value = Number(raw);
    return Number.isFinite(value) ? value : undefined;
}

/**
 * Convert a runner's raw results into the `.ci-report/` contract.
 *
 * Packages whose tests are not driven by tap (`core/blong-browser` runs vitest) call this
 * right after their runner so every package contributes the same machine readable report to
 * `blong-dev ci-report`. The exit code stays with the test runner: this command only
 * reports.
 *
 * `jest` is here for a leg that is jest underneath without being a package's only runner:
 * `tools/blong-log` runs the Storybook test runner beside its tap tests, and without a slice
 * of its own a failure there left the package reading as passed in the aggregate, the
 * metrics and the failures bundle (@@F-539).
 */
export async function report(args: string[]): Promise<void> {
    const cwd = process.cwd();
    const [runner, ...rest] = args;

    if (runner !== 'vitest' && runner !== 'jest') {
        process.stderr.write(
            `blong-dev: report <runner> expects "vitest" or "jest", got "${runner ?? ''}"\n` +
                '  usage: blong-dev report vitest [--input coverage/vitest.json]\n' +
                '         blong-dev report jest [--input .ci-report/jest.json] [--runner <name>]\n',
        );
        process.exitCode = 1;
        return;
    }

    // The runner name is what a reader of the report sees, so a leg reports under its own
    // (`--runner storybook`) and that is also the slice this run replaces.
    const name = runner === 'vitest' ? 'vitest' : (readFlag(rest, '--runner') ?? 'jest');
    const input = resolve(
        cwd,
        readFlag(rest, '--input') ?? (runner === 'vitest' ? VITEST_JSON : JEST_JSON),
    );
    // vitest and jest write the same document, so one reader and one builder serve both.
    const results = readVitestJson(input);
    const exitCode = readExitCode(rest);

    if (!results && (exitCode === undefined || exitCode === 0)) {
        process.stderr.write(
            `blong-dev: no ${runner} json could be read from ${input}; report skipped\n`,
        );
        return;
    }

    clearRun(name, cwd);
    const run = buildJestShapedRun(results, name, cwd);

    // A leg that exited non-zero is never reported green. Its own report may have been
    // written before it died, or never written at all (a dev server that never came up), and
    // a leg whose failure is invisible is how a run reads as two failing operations when
    // three failed (@@F-539).
    if (exitCode !== undefined && exitCode !== 0 && run.counts.failed === 0) {
        const tests: ITestEntry[] = [
            {
                name: `${name} leg exited ${exitCode}`,
                status: 'failed',
                message: `The ${name} leg exited ${exitCode}${
                    results ? '' : ` and wrote no results to ${input}`
                }.`,
            },
        ];
        run.suites.push({name, status: 'failed', counts: countTests(tests), tests});
        run.counts = countTests(run.suites.flatMap(suite => suite.tests));
        run.status = statusOf(run.counts);
    }

    writeRun(run, cwd);
    process.stdout.write(
        `# ${packageName(cwd)} (${run.runner}): ${run.counts.passed} passed, ${run.counts.failed} failed` +
            `${run.counts.skipped > 0 ? `, ${run.counts.skipped} skipped` : ''} ` +
            `(${run.counts.total} total)${existsSync(input) ? '' : ` — no ${input}`}\n`,
    );

    // A vitest-only package (blong-browser) has no Allure producer behind its report,
    // so this is the last step of its run and the moment its published page is written
    // — the same call the tap and Playwright runners make, so the rule for what a
    // package publishes (an Allure report when a producer left results, its rendered
    // page otherwise) lives in one place rather than per package. A second leg of a package
    // that already published renders the page again, which is what keeps it showing every
    // slice the report holds.
    const published = await publishAllureReport(cwd, {
        baseHistory: process.env['CI_BASE_HISTORY'],
    });
    if (published.published) {
        process.stdout.write(`# allure report: ${describeAllurePublish(published)}\n`);
    } else if (published.page) {
        process.stdout.write(`# report page: ${published.page} (no Allure results)\n`);
    }
}
