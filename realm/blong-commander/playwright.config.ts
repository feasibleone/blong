import {defineBlongConfig} from '@feasibleone/blong-browser/playwright/config';

/**
 * blong-commander Playwright configuration — runs the commander `.play.ts`
 * tests against the live dev server (blong-watch backend + Vite frontend).
 *
 * Ports are auto-derived from this package's rush.json index in CI (unique per
 * realm) and default to 8080/5173 for a single local run.
 */
export default defineBlongConfig({
    projects: [{name: 'blong-commander', testDir: './test', testMatch: '**/*.play.ts'}],
});
