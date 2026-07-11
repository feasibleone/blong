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
 * Include tests from realm packages (in addition to local `./test/`):
 * ```ts
 * export default defineBlongConfig({
 *     realmPackages: ['@feasibleone/blong-marine'],
 * });
 * ```
 *
 * Override ports to avoid interference when running Playwright
 * shards or multiple suites in parallel:
 * ```ts
 * export default defineBlongConfig({
 *     backendPort: 9090,
 *     frontendPort: 5180,
 * });
 * ```
 *
 * Ports also default from environment variables `PLAYWRIGHT_BACKEND_PORT`
 * and `PLAYWRIGHT_FRONTEND_PORT`, which is the recommended approach in CI:
 * ```bash
 * PLAYWRIGHT_BACKEND_PORT=9090 PLAYWRIGHT_FRONTEND_PORT=5180 npx playwright test
 * ```
 *
 * Override any other setting via the options parameter:
 * ```ts
 * export default defineBlongConfig({
 *     timeout: 60_000,
 *     use: {blongPermissions: false},
 * });
 * ```
 */
import {defineConfig, type PlaywrightTestConfig, type Project} from '@playwright/test';
import {createRequire} from 'node:module';
import * as os from 'node:os';
import {dirname} from 'node:path';
import type {IBlongTestOptions} from '../playwright.js';

type BlongConfig = PlaywrightTestConfig<IBlongTestOptions> & {
    /**
     * npm package names whose `test/` directories should be included.
     * Each realm runs as a separate Playwright project.
     *
     * Adding a realm to a suite:
     * ```ts
     * realmPackages: ['@feasibleone/blong-marine', '@feasibleone/my-realm'],
     * ```
     */
    realmPackages?: string[];
    /**
     * Port for the backend (blong/blong-watch) server.
     * Defaults to env `PLAYWRIGHT_BACKEND_PORT` or `8080`.
     */
    backendPort?: number;
    /**
     * Port for the frontend (Vite) dev server.
     * Defaults to env `PLAYWRIGHT_FRONTEND_PORT` or `5173`.
     */
    frontendPort?: number;
};

function resolveRealmTestDir(packageName: string): string | null {
    const require = createRequire(import.meta.url);
    try {
        const pkgPath = require.resolve(`${packageName}/package.json`);
        return dirname(pkgPath) + '/test';
    } catch {
        console.warn(`[blong-browser/playwright] Could not resolve test dir for ${packageName}`);
        return null;
    }
}

export function defineBlongConfig(
    overrides: BlongConfig = {},
): ReturnType<typeof defineConfig<IBlongTestOptions>> {
    const {
        use,
        webServer,
        reporter,
        realmPackages,
        projects: projectsOverride,
        backendPort = Number(process.env['PLAYWRIGHT_BACKEND_PORT']) || 8080,
        frontendPort = Number(process.env['PLAYWRIGHT_FRONTEND_PORT']) || 5173,
        ...rest
    } = overrides;

    // Build projects: local test dir + one project per realm package
    const realmProjects: Project<IBlongTestOptions>[] = (realmPackages ?? []).flatMap(pkg => {
        const testDir = resolveRealmTestDir(pkg);
        if (!testDir) return [];
        const name = pkg.replace(/^@[^/]+\//, ''); // strip scope
        return [{name, testDir, testMatch: '**/*.play.ts'}];
    });

    // If realm projects exist, the default project also needs explicit testDir
    const defaultProject: Project<IBlongTestOptions> | undefined =
        realmProjects.length > 0
            ? {name: 'suite', testDir: './test', testMatch: '**/*.play.ts'}
            : undefined;

    const projects =
        projectsOverride ??
        (realmProjects.length > 0 ? [defaultProject!, ...realmProjects] : undefined);

    return defineConfig<IBlongTestOptions>({
        testDir: './test',
        testMatch: '**/*.play.ts',
        timeout: 30_000,
        retries: 1,
        use: {
            baseURL: `http://localhost:${frontendPort}`,
            colorScheme: 'dark',
            viewport: {width: 1600, height: 900},
            trace: 'retain-on-failure',
            screenshot: 'off',
            blongUsername: 'testAdmin',
            blongPassword: 'testPassword',
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
                command: process.env.CI
                    ? `node --run blong -- microservice integration dev playwright ci --gateway.port=${backendPort} --resolution.portGateway=${backendPort}`
                    : `node --run blong-watch --  microservice integration dev playwright --gateway.port=${backendPort} --resolution.portGateway=${backendPort}`,
                port: backendPort,
                reuseExistingServer: !process.env.CI,
                stdout: 'pipe',
                timeout: 60_000,
            },
            {
                command: process.env.CI
                    ? `node --run dev -- --port ${frontendPort} --force`
                    : `node --run dev -- --port ${frontendPort}`,
                url: `http://localhost:${frontendPort}`,
                reuseExistingServer: !process.env.CI,
                stdout: 'pipe',
                timeout: 30_000,
                env: {
                    ...process.env,
                    PLAYWRIGHT_BACKEND_PORT: String(backendPort),
                },
            },
        ],
        ...(projects ? {projects} : {}),
        ...rest,
    });
}
