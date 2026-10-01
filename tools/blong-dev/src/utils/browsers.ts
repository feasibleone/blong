/**
 * Playwright browser preflight.
 *
 * Every Playwright copy on the machine launches the Chromium revision its own
 * release pins, and each revision lives in its own directory of the shared browser
 * cache (`~/.cache/ms-playwright` by default). CI installs the browsers of *one*
 * copy — the workflow runs the first `node_modules/.bin/playwright` it finds — so a
 * leg that resolves a different copy used to die before its first test ran:
 *
 *     Error: Executable doesn't exist at ~/.cache/ms-playwright/chromium_headless_shell-1223/…
 *
 * That is a failure about the run's setup, and it read like a code failure. The
 * preflight below closes it from the other side: the leg that launches a browser
 * asks for its own copy's browser first. `playwright install` is idempotent and
 * silent when the revision is already in the cache (measured at 0.3s), so an
 * ordinary run pays one cheap process and a run whose browser is missing pays the
 * download instead of a red build.
 *
 * `--with-deps` is opt-in and off by default. It shells out to the system package
 * manager to install the OS libraries, which needs root — the one thing that must
 * not happen twice in parallel on a CI runner (the workflow installs them, as root,
 * before the packages start). `PLAYWRIGHT_SKIP_INSTALL` in the test job says the
 * same thing for the `--with-deps` half only; it no longer stops the browser itself
 * from being installed.
 */

import {runTool} from './runTool.ts';
import {toolEnv} from './toolPath.ts';

/**
 * What every blong leg launches.
 *
 * `chromium` is Playwright's name for the headed build *and* the headless shell it
 * ships beside it (`chromium_headless_shell-<revision>` in the cache, which is the
 * directory the Storybook test runner asks for), so one name covers both legs.
 */
const DEFAULT_BROWSERS: readonly string[] = ['chromium'];

/** Runs a tool and resolves its exit code. The shape of `runTool`, injectable. */
export type RunBrowserCommand = (command: string, args: string[], cwd: string) => Promise<number>;

export interface IEnsureBrowsersOptions {
    /** Browser names to install. Defaults to `chromium`. */
    browsers?: readonly string[];
    /**
     * Also install the OS-level libraries (`--with-deps`). Needs root; CI runs it once,
     * up front, which is why this is not the default.
     */
    withDeps?: boolean;
    /** Runs the Playwright CLI; defaults to the shared `runTool`. */
    run?: RunBrowserCommand;
}

/**
 * Make sure the browsers `cwd`'s Playwright launches are installed.
 *
 * Resolves `playwright` through the package's own `node_modules/.bin` first (see
 * {@link toolEnv}), so the preflight prepares exactly the copy the leg will use rather
 * than whichever one happens to be hoisted.
 *
 * @returns The install command's exit code — 0 when the browsers were already present,
 * non-zero when the install failed. Callers report it as a setup failure rather than
 * continuing into a run whose browser is known to be missing.
 */
export async function ensureBrowsers(
    cwd: string,
    options: IEnsureBrowsersOptions = {},
): Promise<number> {
    const browsers = [...(options.browsers ?? DEFAULT_BROWSERS)];
    const args = ['install', ...(options.withDeps ? ['--with-deps'] : []), ...browsers];
    const run =
        options.run ??
        ((command: string, commandArgs: string[], dir: string) =>
            runTool(command, commandArgs, {cwd: dir, env: toolEnv(dir)}));
    try {
        const code = await run('playwright', args, cwd);
        if (code !== 0) {
            process.stderr.write(
                `blong-dev: \`playwright ${args.join(' ')}\` failed with exit code ${code} — ` +
                    'the browsers are missing and could not be installed.\n',
            );
        }
        return code;
    } catch (cause) {
        // A CLI that cannot be started at all is a setup problem too, and the one a
        // package whose Playwright is not installed for this platform would hit: report
        // it as a failed preflight, not as an unhandled rejection with a stack trace.
        process.stderr.write(
            `blong-dev: could not run \`playwright ${args.join(' ')}\` — ` +
                `${cause instanceof Error ? cause.message : String(cause)}\n`,
        );
        return 1;
    }
}
