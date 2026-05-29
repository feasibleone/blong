/**
 * Shared Playwright configuration for blong suites.
 *
 * Provides sensible defaults (test dir, viewport, reporter, webServer)
 * so suite-level `playwright.config.ts` files stay minimal.
 *
 * Usage:
 * ```ts
 * // playwright.config.ts
 * import {defineBlongConfig} from '@feasibleone/blong-browser/playwright/config';
 * export default defineBlongConfig();
 * ```
 *
 * Override any setting via the options parameter:
 * ```ts
 * export default defineBlongConfig({
 *     timeout: 60_000,
 *     use: {blongPermissions: false},
 * });
 * ```
 */
import {defineConfig, type PlaywrightTestConfig} from '@playwright/test';
import * as os from 'node:os';
import type {IBlongTestOptions} from '../playwright.js';

type BlongConfig = PlaywrightTestConfig<IBlongTestOptions>;

export function defineBlongConfig(
    overrides: BlongConfig = {},
): ReturnType<typeof defineConfig<IBlongTestOptions>> {
    const {use, webServer, reporter, ...rest} = overrides;
    return defineConfig<IBlongTestOptions>({
        testDir: './test',
        testMatch: '**/*.play.ts',
        timeout: 30_000,
        retries: 1,
        use: {
            baseURL: 'http://localhost:5173',
            colorScheme: 'dark',
            viewport: {width: 1600, height: 900},
            trace: 'retain-on-failure',
            screenshot: 'off',
            blongUsername: 'admin',
            blongPassword: 'admin',
            ...use,
        },
        expect: {
            toHaveScreenshot: {maxDiffPixelRatio: 0.01},
        },
        outputDir: '.playwright/results',
        reporter: reporter ?? [
            [process.env.CI ? 'list' : 'list'],
            ['html', {open: 'never', outputFolder: '.playwright/report'}],
            [
                'allure-playwright',
                {
                    resultsDir: 'allure-results',
                    environmentInfo: {
                        framework: 'blong',
                        node_version: process.version,
                        os_platform: os.platform(),
                    },
                },
            ],
        ],
        webServer: webServer ?? [
            {
                command: process.env.CI ? 'node --run blong' : 'node --run blong-watch',
                port: 8080,
                reuseExistingServer: !process.env.CI,
                stdout: 'pipe',
                timeout: 60_000,
            },
            {
                command: 'node --run dev',
                url: 'http://localhost:5173',
                reuseExistingServer: !process.env.CI,
                stdout: 'pipe',
                timeout: 30_000,
            },
        ],
        ...rest,
    });
}
