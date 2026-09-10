import {defineBlongConfig} from '@feasibleone/blong-browser/playwright/config';

/**
 * blong-access Playwright configuration — runs the access model `.play.ts`
 * tests against the live dev server (blong-watch backend + Vite frontend) and
 * captures the browse/new/open/detail-tab screenshots.
 *
 * Ports are auto-derived from this package's rush.json index in CI (unique per
 * realm) and default to 8080/5173 for a single local run.
 */
export default defineBlongConfig();
