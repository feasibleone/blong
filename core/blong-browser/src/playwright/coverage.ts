/**
 * Playwright coverage fixture for blong-browser tests.
 *
 * Collects browser-side V8 JavaScript coverage via Playwright's built-in
 * `page.coverage` API and writes it in the format expected by `c8`.
 *
 * Usage in a test file:
 * ```ts
 * import {test} from '@feasibleone/blong-browser/playwright/coverage';
 * // or compose with the portal fixture:
 * import {test} from '@feasibleone/blong-browser/playwright';
 * import {coverageFixture} from '@feasibleone/blong-browser/playwright/coverage';
 * coverageFixture(test);
 * ```
 *
 * The fixture writes coverage data to the directory specified by the
 * `NODE_V8_COVERAGE` environment variable (set automatically when using
 * `blong-dev playwright --coverage`). This data joins the server-side
 * V8 coverage from the blong server process, and both are aggregated
 * by `c8 report`.
 *
 * Browser coverage URLs (from Vite dev server, e.g.
 * `http://localhost:5173/src/components/Portal.tsx`) are mapped to
 * file-system paths relative to the project root so c8 can correlate
 * them with source files.
 */
import {test as base, type Page, type TestType} from '@playwright/test';
import crypto from 'node:crypto';
import {mkdirSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';

interface IV8CoverageEntry {
    scriptId: string;
    url: string;
    functions: Array<{
        functionName: string;
        isBlockCoverage: boolean;
        ranges: Array<{startOffset: number; endOffset: number; count: number}>;
    }>;
}

interface IV8CoverageFile {
    result: IV8CoverageEntry[];
}

/**
 * Map a browser script URL (typically from Vite dev server) to a
 * file-system path that c8 can resolve.
 *
 * Vite dev server URLs look like:
 *   http://localhost:5173/src/components/Portal.tsx
 *   http://localhost:5173/node_modules/.vite/deps/react.js
 *
 * We strip the protocol/host/port and resolve relative to cwd.
 * Source files that are outside the project are excluded.
 */
function browserUrlToFilePath(browserUrl: string, cwd: string): string | null {
    try {
        const url = new URL(browserUrl);
        // Only handle HTTP URLs from the dev server
        if (url.protocol !== 'http:' && url.protocol !== 'https:') {
            // file:// URLs can be used as-is
            if (url.protocol === 'file:') {
                return url.pathname;
            }
            return null;
        }
        const pathname = url.pathname;
        // Exclude Vite client, HMR, node_modules
        if (
            pathname.includes('/node_modules/') ||
            pathname.includes('/@vite/') ||
            pathname.includes('/@react-refresh') ||
            pathname.startsWith('/favicon')
        ) {
            return null;
        }
        // Strip leading / and resolve against cwd
        const relPath = pathname.startsWith('/') ? pathname.slice(1) : pathname;
        return join(cwd, relPath);
    } catch {
        return null;
    }
}

/**
 * Write a single browser coverage entry as a V8 coverage JSON file
 * in the directory pointed to by NODE_V8_COVERAGE.
 */
function writeBrowserCoverage(coverage: IV8CoverageEntry[], v8Dir: string): void {
    if (coverage.length === 0) return;

    mkdirSync(v8Dir, {recursive: true});

    // Group entries by file path (multiple scriptId entries may map to the same file)
    const byFile = new Map<string, IV8CoverageEntry[]>();
    const cwd = process.cwd();

    for (const entry of coverage) {
        const filePath = browserUrlToFilePath(entry.url, cwd);
        if (!filePath) continue;
        const group = byFile.get(filePath) ?? [];
        group.push(entry);
        byFile.set(filePath, group);
    }

    // Write one V8 coverage JSON file per unique file
    for (const [filePath, entries] of byFile) {
        const v8File: IV8CoverageFile = {
            result: entries.map(e => ({
                scriptId: e.scriptId,
                url: `file://${filePath}`,
                functions: e.functions,
            })),
        };
        const hash = crypto.createHash('md5').update(filePath).digest('hex').slice(0, 12);
        const outFile = join(v8Dir, `browser-${hash}.json`);
        writeFileSync(outFile, JSON.stringify(v8File));
    }
}

/**
 * Creates a new test object extended with browser-side coverage collection.
 *
 * The fixture runs automatically (`auto: true`) — it starts JS coverage
 * collection at the beginning of each test and writes the results to
 * `NODE_V8_COVERAGE` directory after the test completes.
 *
 * @param testType - The Playwright test object to extend.
 * @returns A new test object with the coverage fixture added.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
export function coverageFixture<
    TestArgs extends Record<string, any>,
    WorkerArgs extends Record<string, any>,
>(testType: TestType<TestArgs, WorkerArgs>): TestType<TestArgs, WorkerArgs> {
    return (testType as any).extend({
        collectBrowserCoverage: [
            async ({page}: {page: Page}, useFixture: () => Promise<void>) => {
                const v8Dir = process.env['NODE_V8_COVERAGE'];
                if (!v8Dir) {
                    // Not running under --coverage mode; skip silently
                    await useFixture();
                    return;
                }

                try {
                    // Use resetOnNavigation: false so coverage accumulates
                    // across navigation (login → test actions)
                    await page.coverage.startJSCoverage({
                        resetOnNavigation: false,
                    });
                } catch {
                    // coverage API may not be available in all browsers (Chromium only)
                    await useFixture();
                    return;
                }

                let coverage: IV8CoverageEntry[] = [];
                try {
                    await useFixture();
                    coverage =
                        (await page.coverage.stopJSCoverage()) as unknown as IV8CoverageEntry[];
                } catch {
                    // Swallow errors during coverage stop
                }

                if (coverage.length > 0) {
                    writeBrowserCoverage(coverage, v8Dir);
                }
            },
            {auto: true, scope: 'test'},
        ],
    }) as TestType<TestArgs, WorkerArgs>;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * Pre-extended test with browser-side coverage collection enabled.
 *
 * Use this instead of importing from `@feasibleone/blong-browser/playwright`
 * when you want to collect browser JS coverage during test runs.
 *
 * ```ts
 * import {test, expect} from '@feasibleone/blong-browser/playwright/coverage';
 * ```
 *
 * Note: This test does NOT include the `portal` fixture. Compose fixtures
 * when you need both coverage and portal support:
 * ```ts
 * import {test as baseTest, expect} from '@feasibleone/blong-browser/playwright';
 * import {coverageFixture} from '@feasibleone/blong-browser/playwright/coverage';
 * const test = coverageFixture(baseTest);
 * ```
 */
export const test = coverageFixture(base);
