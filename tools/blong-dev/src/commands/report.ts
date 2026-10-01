import {resolve} from 'node:path';

import {publishAllureReport} from '../report/allurePublish.ts';
import {packageName} from '../report/reportPaths.ts';
import {clearRun, writeRun} from '../report/reportWrite.ts';
import {VITEST_JSON, buildVitestRun, readVitestJson} from '../report/vitestReport.ts';

/** Read `--flag value` or `--flag=value` from a positional argument list. */
function readFlag(args: readonly string[], flag: string): string | undefined {
    for (let index = 0; index < args.length; index += 1) {
        const arg = args[index]!;
        if (arg === flag) return args[index + 1];
        if (arg.startsWith(`${flag}=`)) return arg.slice(flag.length + 1);
    }
    return undefined;
}

/**
 * Convert a runner's raw results into the `.ci-report/` contract.
 *
 * Packages whose tests are not driven by tap (`core/blong-browser` runs vitest)
 * call this right after their runner so every package contributes the same
 * machine readable report to `blong-dev ci-report`. The exit code stays with the
 * test runner: this command only reports.
 */
export async function report(args: string[]): Promise<void> {
    const cwd = process.cwd();
    const [runner, ...rest] = args;

    if (runner !== 'vitest') {
        process.stderr.write(
            `blong-dev: report <runner> expects "vitest", got "${runner ?? ''}"\n` +
                '  usage: blong-dev report vitest [--input coverage/vitest.json]\n',
        );
        process.exitCode = 1;
        return;
    }

    const input = resolve(cwd, readFlag(rest, '--input') ?? VITEST_JSON);
    const vitest = readVitestJson(input);
    if (!vitest) {
        process.stderr.write(
            `blong-dev: no vitest json could be read from ${input}; report skipped\n`,
        );
        return;
    }

    // This runner's slice is dropped first, so a converter that dies mid-way leaves
    // no previous vitest report to be aggregated as this one's — and the package's
    // other runners keep theirs.
    clearRun('vitest', cwd);
    const run = buildVitestRun(vitest, cwd);
    writeRun(run, cwd);
    process.stdout.write(
        `# ${packageName(cwd)} (vitest): ${run.counts.passed} passed, ${run.counts.failed} failed` +
            `${run.counts.skipped > 0 ? `, ${run.counts.skipped} skipped` : ''} ` +
            `(${run.counts.total} total)\n`,
    );

    // A vitest-only package (blong-browser) has no Allure producer behind its report,
    // so this is the last step of its run and the moment its published page is written
    // — the same call the tap and Playwright runners make, so the rule for what a
    // package publishes (an Allure report when a producer left results, its rendered
    // page otherwise) lives in one place rather than per package.
    const published = await publishAllureReport(cwd, {
        baseHistory: process.env['CI_BASE_HISTORY'],
    });
    if (published.published) {
        process.stdout.write(
            `# allure report: ${published.reportDir} (${published.producers} producer(s))\n`,
        );
    } else if (published.page) {
        process.stdout.write(`# report page: ${published.page} (no Allure results)\n`);
    }
}
