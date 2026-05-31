import {defineBlongConfig} from '@feasibleone/blong-browser/playwright/config';

/**
 * blong-suite Playwright configuration.
 *
 * To add another realm's tests, append its package name to `realmPackages`.
 * Each realm's `test/` directory will run as a separate Playwright project.
 */
export default defineBlongConfig({
    realmPackages: ['@feasibleone/blong-marine'],
});
