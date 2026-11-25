import {defineBlongViteConfig} from '@feasibleone/blong-browser/vite';

/**
 * vite.config.ts — the dev server and bundle for this realm's portal (`@@T-796`).
 *
 * The factory is the framework's, so the entry (`index.html.ts`), the port pair the Playwright
 * runner derives and the chunking of a lazily imported page are the same here as in every realm that
 * has a UI.
 */
export default defineBlongViteConfig({
    importMetaUrl: import.meta.url,
});
