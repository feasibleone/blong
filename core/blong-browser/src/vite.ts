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
import {fileURLToPath} from 'node:url';
import gzipPlugin from 'rollup-plugin-gzip';
import {type Plugin, type UserConfig, defineConfig, mergeConfig} from 'vite';
import {brotliCompressSync} from 'zlib';

const dir = (url: string) => dirname(url.replace(/file:\//g, ''));

/**
 * Name of the plugin that keeps fixtures out of an app build.
 *
 * Exported so `defineBlongStorybookMain` removes the very same plugin instead of
 * repeating the string: Storybook is the one build that wants the real rows.
 */
export const DROP_FIXTURES = 'blong-drop-fixtures';

/**
 * Replace every `meta/fixture` module with an empty handler of the same name.
 *
 * A realm globs `meta/fixture` in its `browser.ts` so the Storybook mock adapter
 * can register the sample rows it reads through `handler['{subject}Fixture']`.
 * That glob cannot be made conditional: `import.meta.glob` is expanded at build
 * time, so the matched modules are in the app's module graph — and in its
 * output — even behind a branch that is never taken.
 *
 * Fixtures are Storybook's data, so an app build drops them here instead: each
 * `meta/fixture` module resolves to a handler that returns no rows, and
 * Storybook's own config removes this plugin (see `storybookMain.ts`) so its
 * build keeps the real file.
 *
 * The stub is a *handler* rather than an empty module on purpose: the loader logs
 * an error for a handler file whose default export is missing, and a stub that
 * threw would turn an unused fixture into a boot failure. The server platform is
 * unaffected either way — it scans layer folders instead of globbing them, so a
 * realm's `config.mock` still serves its models from the real fixture file.
 */
const dropFixtures = (): Plugin => ({
    name: DROP_FIXTURES,
    enforce: 'pre',
    load(id) {
        const [file] = id.split('?');
        if (!/[\\/]meta[\\/]fixture[\\/]/.test(file as string)) return null;
        const name = (file as string)
            .split(/[\\/]/)
            .pop()!
            .replace(/\.\w+$/, '');
        return [
            `import {handler} from '@feasibleone/blong';`,
            `export default handler(() => async function ${name}() {`,
            `    return {};`,
            `});`,
            '',
        ].join('\n');
    },
});

/**
 * This package, as source — what a suite bundles instead of the published bundle.
 *
 * `exports` of `@feasibleone/blong-browser` sends a production build to
 * `dist/blong-browser.es.js`, and the package's own `build` script emits declarations
 * only: the bundle is a *publish* artifact, produced by the manual `build_` script,
 * which no rush build and no workflow in this repository runs. A suite's `vite build`
 * therefore resolved a file that either does not exist or is whatever a previous
 * manual run left behind — which is how `@feasibleone/blong-suite` came to fail with
 * `"DiagramViewer" is not exported by …/dist/blong-browser.es.js` after the viewer was
 * added, and would have failed the same way on a clean checkout. Bundling the source
 * is what the dev server already does (the `development` export condition), so the two
 * now agree; the published package is unchanged for consumers outside the monorepo.
 *
 * Kept lazy and scheme-agnostic because this module is also loaded outside a build:
 * `browserBundle.test.ts` imports it, and there `import.meta.url` is not a file url.
 */
const browserEntry = (() => {
    const entry = new URL('./index.ts', import.meta.url);
    return entry.protocol === 'file:' ? fileURLToPath(entry) : entry.href;
})();

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
        plugins: [react(), dropFixtures()],
        build: {
            minify: false,
            assetsInlineLimit: 0,
            cssCodeSplit: true,
            rollupOptions: {
                output: {
                    // Keep function names for better debugging in Storybook
                    keepNames: true,
                },
                plugins: [
                    gzipPlugin(), // Generates .gz files
                    gzipPlugin({
                        customCompression: content => brotliCompressSync(Buffer.from(content)),
                        fileName: '.br', // Generates .br files
                    }),
                ],
            },
        },
        server: {
            proxy: {
                '/rpc': rpcTarget,
            },
            /**
             * What the watcher must not look at: the artifacts the run itself
             * writes.
             *
             * Playwright's output directory is `.playwright/` here — the default
             * `test-results/` is in Vite's own ignore list, which is why this was
             * never a problem before the tooling moved it. Every trace resource it
             * writes is an `.html` file inside the served root, so the watcher sees
             * it, the HTML handling treats it as a page, and the browser is told to
             * **reload** — mid-test. One failing test therefore reloads every test
             * that follows it, which is how a single flake becomes a run of
             * failures. The rest of the list is the same class of file: anything a
             * run writes into its own package.
             *
             * `dist/` is on that list for the same reason and cost a debugging
             * cycle: `vite build` leaves the app bundle (HTML included) in the
             * served root, and a Playwright run started while that write is fresh
             * reloads mid-test — six tests went flaky with one-minute timeouts,
             * then the suite was green twice in a row once `dist/` was removed.
             */
            watch: {
                ignored: [
                    '**/.git/**',
                    '**/node_modules/**',
                    '**/dist/**',
                    '**/.playwright/**',
                    '**/allure-results/**',
                    '**/allure-report/**',
                    '**/.ci-report/**',
                    '**/.tap/**',
                    '**/coverage/**',
                    '**/storybook-static/**',
                ],
            },
            fs: {
                // Allow Vite to serve files from the Rush pnpm virtual store.
                //
                // Needed for:
                //  - fonts/assets in packages like primeicons;
                //  - `primereact` theme CSS, loaded at runtime as `?inline`
                //    dynamic imports by the theme switcher (`themeRegistry.ts`).
                //    Vite's dev-server fs guard runs the allow-list check on
                //    query-bearing requests (`?inline`/`?url`/`?raw`), so a
                //    package that is only reachable through the module graph is
                //    served as raw CSS instead of being transformed to a JS
                //    module — the browser then rejects it with a
                //    `text/css` MIME type error and no theme is applied.
                allow: [
                    dir(importMetaUrl),
                    dir(new URL(import.meta.resolve('primeicons/package.json')).pathname),
                    dir(new URL(import.meta.resolve('primereact/package.json')).pathname),
                ],
            },
        },
        resolve: {
            alias: [
                // Exact match, so the package's own subpath exports (`/vite`,
                // `/playwright`, `/browser.js`) keep resolving through `exports`.
                {find: /^@feasibleone\/blong-browser$/, replacement: browserEntry},
                // In the monorepo, point @feasibleone/blong directly at source
                // so Vite picks up TypeScript changes without a build step.
                {
                    find: '@feasibleone/blong/types',
                    replacement: new URL(import.meta.resolve('@feasibleone/blong/types')).href,
                },
                {
                    find: '@feasibleone/blong',
                    replacement: new URL(import.meta.resolve('@feasibleone/blong')).pathname,
                },
            ],
        },
    };

    return defineConfig(mergeConfig(base, overrides));
}
