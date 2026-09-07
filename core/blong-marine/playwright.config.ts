import {defineBlongConfig} from '@feasibleone/blong-browser/playwright/config';

/**
 * Ports are auto-derived from this package's rush.json index in CI (unique per
 * realm) and default to 8080/5173 for a single local run.
 */
export default defineBlongConfig({
    projects: [{name: 'blong-marine', testDir: './test', testMatch: '**/*.play.ts'}],
});
