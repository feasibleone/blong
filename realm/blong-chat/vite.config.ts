import {defineBlongViteConfig} from '@feasibleone/blong-browser/vite';

/** The portal's build: the composed browser entry, with the framework's plugins. */
export default defineBlongViteConfig({
    importMetaUrl: import.meta.url,
});
