import {resolve} from 'node:path';

import {writeReport} from '../report/reportWrite.ts';
import {VITEST_JSON, buildVitestReport, readVitestJson} from '../report/vitestReport.ts';

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
        process.stderr.write(`blong-dev: no vitest json could be read from ${input}; report skipped\n`);
        return;
    }

    const built = buildVitestReport(vitest, cwd);
    writeReport(built, cwd);
    process.stdout.write(
        `# ${built.package}: ${built.counts.passed} passed, ${built.counts.failed} failed` +
            `${built.counts.skipped > 0 ? `, ${built.counts.skipped} skipped` : ''} ` +
            `(${built.counts.total} total)\n`,
    );
}
