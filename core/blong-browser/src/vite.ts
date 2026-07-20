/**
 * Reusable Vite configuration factory for blong browser applications.
 *
 * Provides sensible defaults (React plugin, RPC proxy, primeicons fs allow,
 * keepNames for Storybook debugging) so suite-level `vite.config.ts` files
 * stay minimal.
 *
 * Usage:
 * ```ts
 * // vite.config.ts
 * import {defineBlongViteConfig} from '@feasibleone/blong-browser/vite';
 * export default defineBlongViteConfig({importMetaUrl: import.meta.url});
 * ```
 *
 * Override any setting via the options parameter:
 * ```ts
 * export default defineBlongViteConfig({
 *     importMetaUrl: import.meta.url,
 *     server: {proxy: {'/rpc': 'http://localhost:9090'}},
 *     resolve: {alias: {'@feasibleone/blong': new URL('../blong/types.ts', import.meta.url).pathname}},
 * });
 * ```
 */
import react from '@vitejs/plugin-react';
import {dirname} from 'node:path';
import {type UserConfig, defineConfig, mergeConfig} from 'vite';

const dir = (url: string) => dirname(url.replace(/file:\//g, ''));

export interface IBlongViteOptions {
    /**
     * `import.meta.url` from the caller's vite.config.ts.
     * Used to derive the correct `server.fs.allow` path for primeicons assets.
     */
    importMetaUrl: string;
    /** Any Vite UserConfig overrides merged on top of the defaults. */
    overrides?: UserConfig;
    /** Override the RPC proxy target (defaults to 'http://localhost:8080'). */
    rpcTarget?: string;
}

export function defineBlongViteConfig({
    importMetaUrl,
    overrides = {},
    rpcTarget = `http://localhost:${process.env['PLAYWRIGHT_BACKEND_PORT'] || 8080}`,
}: IBlongViteOptions): ReturnType<typeof defineConfig> {
    const base: UserConfig = {
        base: '/s/',
        plugins: [react()],
        build: {
            minify: false,
            assetsInlineLimit: 0,
            cssCodeSplit: true,
            rollupOptions: {
                output: {
                    // Keep function names for better debugging in Storybook
                    keepNames: true,
                },
            },
        },
        server: {
            proxy: {
                '/rpc': rpcTarget,
            },
            fs: {
                // Allow Vite to serve files from the Rush pnpm virtual store
                // (needed for fonts/assets in packages like primeicons).
                allow: [
                    dir(importMetaUrl),
                    dir(new URL(import.meta.resolve('primeicons/package.json')).pathname),
                ],
            },
        },
        resolve: {
            alias: {
                // In the monorepo, point @feasibleone/blong directly at source
                // so Vite picks up TypeScript changes without a build step.
                '@feasibleone/blong/types': new URL(import.meta.resolve('@feasibleone/blong/types'))
                    .href,
                '@feasibleone/blong': new URL(import.meta.resolve('@feasibleone/blong')).pathname,
            },
        },
    };

    return defineConfig(mergeConfig(base, overrides));
}
