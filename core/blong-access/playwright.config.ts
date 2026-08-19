import {defineBlongConfig} from '@feasibleone/blong-browser/playwright/config';

/**
 * blong-access Playwright configuration — runs the access model `.play.ts`
 * tests against the live dev server (blong-watch backend + Vite frontend) and
 * captures the browse/new/open/detail-tab screenshots.
 *
 * Distinct ports avoid clashing with other locally-running suites.
 */
export default defineBlongConfig({
    backendPort: 9083,
    frontendPort: 9183,
});
