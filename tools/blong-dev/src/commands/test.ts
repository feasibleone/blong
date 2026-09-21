import {rmSync} from 'node:fs';
import {join} from 'node:path';

import {reportDir} from '../report/reportPaths.ts';
import {runTap} from '../report/tapReport.ts';
import {toolEnv} from '../utils/toolPath.ts';

/**
 * Seconds a package's tap subprocess is given, passed to tap as `--timeout`.
 *
 * tap's default is 30 seconds, which is smaller than the *fixed* cost of an
 * integration entry point: `index.test.ts` loads the server and the browser platform
 * through the runtime before a single test runs, measured at 13.5s of a ~26s file in
 * `realm/blong-access`. On a cold CI runner that exceeded the default, and the file was
 * reported as `✖ timeout!` with every test inside it passing — the budget was too
 * small, and the report reads as a hung suite instead.
 *
 * Generous rather than tight because tap hands the same number to the child as its
 * per-test timeout, so this is the ceiling for a genuine hang rather than a budget a
 * suite is expected to approach (D-247, F-225). Override per run with an explicit
 * `--timeout`, which this default never shadows.
 */
const TAP_TIMEOUT_SECONDS = 180;

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
    // An explicit `--timeout` wins: the default exists so an integration suite is not
    // judged against a budget smaller than its own startup, not to overrule a run that
    // says otherwise.
    const hasOwnTimeout = args.some(arg => arg === '--timeout' || arg.startsWith('--timeout='));
    const timeout = hasOwnTimeout ? [] : [`--timeout=${TAP_TIMEOUT_SECONDS}`];
    const exitCode = await runTap(
        [...globs, '--allow-incomplete-coverage', '--coverage-report=none', ...timeout, ...args],
        cwd,
        env,
    );

    process.exitCode = exitCode;
}
