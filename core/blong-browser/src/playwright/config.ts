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
 * Ports are selected in this priority:
 *   1. explicit `backendPort` / `frontendPort` options;
 *   2. `PLAYWRIGHT_BACKEND_PORT` / `PLAYWRIGHT_FRONTEND_PORT` env vars;
 *   3. in CI, a per-realm pair auto-derived from the package's index in the
 *      Rush `rush.json` (`backend = 9000 + index`, `frontend = backend + 100`)
 *      so parallel suites never collide on the default ports;
 *   4. locally, the classic default ports `8080` / `5173` (so a single local
 *      run reuses your running dev server):
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
import {existsSync, readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import * as os from 'node:os';
import {dirname, join, resolve} from 'node:path';
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

/** Backend port base for a project in CI: 9000 + rush.json project index. */
const CI_BACKEND_BASE = 9000;
/** Frontend = backend + this offset (keeps the established 90xx/91xx split). */
const FRONTEND_OFFSET = 100;

/** Strip JSONC comments (block `/* *\/` and line `//`) without touching strings. */
function stripJsoncComments(text: string): string {
    let out = '';
    let quote: '"' | "'" | null = null;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (quote) {
            out += c;
            if (c === '\\') {
                out += text[i + 1] ?? '';
                i++;
            } else if (c === quote) quote = null;
            continue;
        }
        if (c === '"' || c === "'") {
            quote = c;
            out += c;
            continue;
        }
        if (c === '/' && text[i + 1] === '/') {
            while (i < text.length && text[i] !== '\n') i++;
            out += '\n';
            continue;
        }
        if (c === '/' && text[i + 1] === '*') {
            i += 2;
            while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i++;
            i++;
            continue;
        }
        out += c;
    }
    return out;
}

/** Walk up from `startDir` to find `fileName`; returns its path or null. */
function findUp(startDir: string, fileName: string): string | null {
    let dir = resolve(startDir);
    for (;;) {
        const candidate = join(dir, fileName);
        if (existsSync(candidate)) return candidate;
        const parent = dirname(dir);
        if (parent === dir) return null;
        dir = parent;
    }
}

/**
 * Resolve a unique per-realm port pair for parallel CI runs from the calling
 * package's index in the monorepo `rush.json` (`backend = 9000 + index`,
 * `frontend = backend + 100`). Returns null when the current package is not part
 * of a Rush workspace, so the default 8080/5173 is used instead.
 */
function resolveUniquePorts(): {backendPort: number; frontendPort: number} | null {
    try {
        const cwd = process.cwd();
        const pkgFile = findUp(cwd, 'package.json');
        const rushFile = findUp(cwd, 'rush.json');
        if (!pkgFile || !rushFile) return null;
        const pkg = JSON.parse(readFileSync(pkgFile, 'utf8')) as {name?: string};
        if (!pkg.name) return null;
        const rush = JSON.parse(stripJsoncComments(readFileSync(rushFile, 'utf8'))) as {
            projects?: Array<{packageName?: string}>;
        };
        const index = (rush.projects ?? []).findIndex(p => p.packageName === pkg.name);
        if (index < 0) return null;
        return {
            backendPort: CI_BACKEND_BASE + index,
            frontendPort: CI_BACKEND_BASE + index + FRONTEND_OFFSET,
        };
    } catch {
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
        backendPort: explicitBackendPort,
        frontendPort: explicitFrontendPort,
        ...rest
    } = overrides;
    // Port selection: explicit option → PLAYWRIGHT_* env → (CI) a unique pair
    // derived from the package's rush.json index → (local) default 8080/5173 so
    // a single local run reuses your running dev server.
    const derived = resolveUniquePorts();
    const backendPort =
        explicitBackendPort ??
        (Number(process.env['PLAYWRIGHT_BACKEND_PORT']) ||
            (process.env.CI && derived ? derived.backendPort : 8080));
    const frontendPort =
        explicitFrontendPort ??
        (Number(process.env['PLAYWRIGHT_FRONTEND_PORT']) ||
            (process.env.CI && derived ? derived.frontendPort : 5173));

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
        // Test-level timeout stays generous (network + dev-server compile can be
        // slow). Element-level waits in the Portal helpers deliberately use the
        // shorter BLONG_ELEMENT_TIMEOUT (5s) so missing elements fail fast.
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
