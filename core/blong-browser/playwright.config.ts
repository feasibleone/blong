import {defineConfig} from '@playwright/test';

/**
 * Playwright configuration for the component library's own Storybook.
 *
 * This package's stories are the running examples the docs point at — `concepts/editor-features.md`
 * photographs the `Editor/…` group — and the story files live beside the components, so the runner
 * that photographs them belongs here rather than in a realm that only composes model pages.
 *
 * The suite is small and self-contained on purpose:
 *
 * - **One project, no realm packages.** Nothing here needs a gateway or a realm's Vite app: the
 *   stories answer their own methods from fixtures (`.storybook/dispatch.tsx`), which is exactly
 *   what makes them stable enough to photograph.
 * - **The dev server is the webServer.** `npm run storybook` is what a reviewer runs by hand, so
 *   the run starts the same command instead of asking for a second terminal; `reuseExistingServer`
 *   keeps a server a developer already has open.
 * - **`--ci` and `--quiet` in CI only.** Locally the flags are harmless, but they are what make the
 *   run non-interactive when nothing is watching the output.
 *
 * This config is not wired into any rush bulk command (`ci-ui` has no per-package script here), so
 * a CI run does not start a Storybook: the spec is a smoke test a developer or the docs generator
 * runs on demand. `ci-test` stays vitest.
 */
export default defineConfig({
    testDir: './test',
    testMatch: '**/*.play.ts',
    timeout: 60_000,
    retries: 1,
    use: {
        baseURL: 'http://127.0.0.1:6006',
        // The stories render under the compact dark palette; the default keeps a capture from
        // depending on the machine's preference.
        colorScheme: 'dark',
        viewport: {width: 1400, height: 900},
        trace: 'retain-on-failure',
        screenshot: 'off',
    },
    expect: {timeout: 15_000},
    outputDir: '.playwright/results',
    reporter: [['list'], ['html', {open: 'never', outputFolder: '.playwright/report'}]],
    webServer: {
        command: 'npm run storybook -- --ci --quiet',
        url: 'http://127.0.0.1:6006/index.json',
        reuseExistingServer: !process.env.CI,
        stdout: 'pipe',
        // A cold first start has to optimize a large dependency graph; the warm one is seconds.
        timeout: 240_000,
    },
});
