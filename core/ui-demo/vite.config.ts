import react from '@vitejs/plugin-react';
import {defineConfig} from 'vite';

export default defineConfig({
    plugins: [react()],
    resolve: {
        alias: {
            // @feasibleone/blong has no dist in the monorepo; point directly at source
            '@feasibleone/blong/types': new URL('../blong/types.ts', import.meta.url).href,
            '@feasibleone/blong': new URL('../blong/types.ts', import.meta.url).pathname,
        },
    },
    build: {
        minify: false,
        rollupOptions: {
            output: {
                // Keep function names for better debugging in Storybook
                keepNames: true,
            },
        },
    },
});
