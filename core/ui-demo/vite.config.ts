import react from '@vitejs/plugin-react';
import {dirname} from 'node:path';
import {defineConfig} from 'vite';

const dir = (url: string) => dirname(url.replace(/file:\//g, ''));

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
    server: {
        proxy: {
            '/rpc': 'http://localhost:8080',
        },
        fs: {
            // Allow Vite to serve files from the Rush pnpm virtual store
            // (needed for fonts/assets in packages like primeicons).
            // __dirname is .storybook/ → 3 levels up reaches the monorepo root.
            allow: [
                dir(import.meta.url),
                dir(import.meta.resolve('primeicons/package.json')),
            ],
        },
    },
});
