import {defineBlongConfig} from '@feasibleone/blong-browser/playwright/config';

/**
 * One worker (the specs share a database) and deliberately tight timeouts:
 * each spec is a smoke check that a page renders, so a missing page should cost
 * seconds rather than the framework's full 60s test timeout.
 *
 * Element-level waits use `BLONG_ELEMENT_TIMEOUT` (see blong-browser's
 * `playwright.ts`), which honours the `BLONG_ELEMENT_TIMEOUT` env var.
 */
export default defineBlongConfig({
    workers: 1,
    timeout: 20_000,
    retries: 0,
    expect: {
        timeout: 3_000,
        toHaveScreenshot: {maxDiffPixelRatio: 0.01},
    },
});
