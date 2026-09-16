import {defineBlongConfig} from '@feasibleone/blong-browser/playwright/config';

/**
 * blong-access Playwright configuration — runs the access model `.play.ts`
 * tests against the live dev server (blong-watch backend + Vite frontend) and
 * captures the browse/new/open/detail-tab screenshots.
 *
 * A single worker deliberately: the specs share one database and create/delete
 * roles and users, and the ACL matrix lists both as candidate scope rows — run
 * in parallel, its screenshots would drift with whatever else is mid-flight.
 *
 * Ports are auto-derived from this package's rush.json index in CI (unique per
 * realm) and default to 8080/5173 for a single local run.
 */
export default defineBlongConfig({workers: 1});
