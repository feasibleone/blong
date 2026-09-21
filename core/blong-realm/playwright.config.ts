import {defineBlongConfig} from '@feasibleone/blong-browser/playwright/config';

/**
 * One worker (the specs share a database) and deliberately tight timeouts:
 * each spec is a smoke check that a page renders, so a missing page should cost
 * seconds rather than the framework's full 60s test timeout.
 *
 * Element-level waits use `BLONG_ELEMENT_TIMEOUT` (see blong-browser's
 * `playwright.ts`), which honours the `BLONG_ELEMENT_TIMEOUT` env var. The one
 * exception is the app's first paint after a navigation — the login form — which
 * waits under `BLONG_BOOT_TIMEOUT` instead: it is the dev server booting, not an
 * element being missing, and 5s is less than a cold boot on CI takes. Its default
 * (15s) stays inside the 20s budget below, so this realm's policy is unchanged.
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
