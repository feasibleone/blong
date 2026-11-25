import {defineBlongConfig} from '@feasibleone/blong-browser/playwright/config';

/**
 * playwright.config.ts — how the session page is driven (`@@T-801`).
 *
 * The framework's factory owns the browsers, the port pair, the retries and the reporting; the realm
 * only says which suite serves the page, which it does by having an `index.browser.ts` beside this
 * file.
 */
export default defineBlongConfig();
