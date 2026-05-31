import {defineBlongViteConfig} from '@feasibleone/blong-browser/vite';

export default defineBlongViteConfig({
    importMetaUrl: import.meta.url,
    overrides: {
        resolve: {
            alias: {
                // In the monorepo, point @feasibleone/blong directly at source
                // so Vite picks up TypeScript changes without a build step.
                '@feasibleone/blong/types': new URL('../blong/types.ts', import.meta.url).href,
                '@feasibleone/blong': new URL('../blong/types.ts', import.meta.url).pathname,
            },
        },
    },
});
