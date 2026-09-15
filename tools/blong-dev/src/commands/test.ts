import {rmSync} from 'node:fs';
import {join} from 'node:path';

import {reportDir} from '../report/reportPaths.ts';
import {runTap} from '../report/tapReport.ts';
import {toolEnv} from '../utils/toolPath.ts';

/**
 * Run tap tests in the current working directory.
 *
 * Delegates to {@link runTap}, which keeps the full TAP stream in
 * `.ci-report/tests.tap`, writes the `.ci-report/report.json` contract used by
 * `blong-dev ci-report`, and prints only a compact failure view so the CI log
 * stays readable. Passing `--reporter=<name>` bypasses all of that and hands
 * stdio back to tap so its own reporters keep working.
 */
export async function test(args: string[]): Promise<void> {
    const cwd = process.cwd();
    const env = toolEnv(cwd);

    // Fresh coverage output each run so tap V8 JSONs never accumulate.
    rmSync(join(cwd, '.tap', 'coverage'), {recursive: true, force: true});
    // Fresh report output so a stale report can never be aggregated as current.
    rmSync(reportDir(cwd), {recursive: true, force: true});

    // Explicit globs by default: tap's own discovery also matches non-test files
    // that merely live under a `test/` folder (Playwright specs, layer files).
    // A caller that passes its own glob keeps full control, which is how
    // `core/blong-chain` excludes its intentionally failing `examples/`.
    const hasOwnGlobs = args.some(arg => !arg.startsWith('-'));
    const globs = hasOwnGlobs ? [] : ['*.test.ts', '**/*.test.ts'];
    const exitCode = await runTap(
        [...globs, '--allow-incomplete-coverage', '--coverage-report=none', ...args],
        cwd,
        env,
    );

    process.exitCode = exitCode;
}
