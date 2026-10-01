/**
 * `blong-dev browsers` — install the Playwright browsers the current package
 * launches, for the legs that do *not* run through `blong-dev playwright`.
 *
 * `blong-dev playwright` installs the browsers itself, so this command exists for
 * the other runners a package script drives directly: the Storybook test runner
 * (`npx test-storybook`), whose Playwright is resolved by
 * `@storybook/test-runner` rather than by the test script. A CI job installs the
 * browsers of one Playwright copy for the whole run, and a leg that resolves another
 * copy died with `Executable doesn't exist at …/chromium_headless_shell-<revision>`
 * before a single test ran.
 *
 * Idempotent and silent when the browser is already in the cache, so a package
 * script may prefix it unconditionally:
 *
 *     "storybook:test:ci": "blong-dev browsers && test-storybook --url …"
 *
 * `--with-deps` additionally installs the OS libraries and needs root; the CI
 * workflow installs them once for the whole run, so it is off by default here.
 */

import {writeUsage} from '../usage.ts';
import {ensureBrowsers} from '../utils/browsers.ts';

export async function browsers(args: string[]): Promise<void> {
    if (args.includes('--help') || args.includes('-h')) {
        process.stdout.write('Usage: blong-dev browsers [--with-deps]\n');
        return;
    }
    if (args.some(arg => arg !== '--with-deps' && !arg.startsWith('-'))) {
        process.stderr.write('blong-dev: browsers takes no arguments besides --with-deps\n');
        writeUsage(process.stderr);
        process.exitCode = 1;
        return;
    }
    const code = await ensureBrowsers(process.cwd(), {withDeps: args.includes('--with-deps')});
    if (code !== 0) process.exitCode = code;
}
