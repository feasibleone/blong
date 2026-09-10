import {defineBlongConfig} from '@feasibleone/blong-browser/playwright/config';

/**
 * blong-suite Playwright configuration.
 *
 * To add another realm's tests, append its package name to `realmPackages`.
 * Each realm's `test/` directory will run as a separate Playwright project.
 *
 * Ports are auto-derived from this package's rush.json index in CI (unique per
 * realm) and default to 8080/5173 for a single local run.
 */
export default defineBlongConfig({
    realmPackages: ['@feasibleone/blong-marine'],
});
