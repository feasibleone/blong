/**
 * Reusable Storybook main configuration factory for blong suites.
 *
 * Provides the common setup (framework, addons, viteFinal) so each
 * package only needs to declare its own stories paths and any extra
 * realm packages whose stories should be included.
 *
 * Usage in a suite's .storybook/main.ts:
 * ```ts
 * import {defineBlongStorybookMain} from '@feasibleone/blong-browser/storybookMain';
 * export default defineBlongStorybookMain({
 *     importMetaDirname: __dirname,
 *     realmPackages: ['@feasibleone/blong-marine'],
 * });
 * ```
 *
 * Usage in a realm's own .storybook/main.ts (standalone):
 * ```ts
 * import {defineBlongStorybookMain} from '@feasibleone/blong-browser/storybookMain';
 * export default defineBlongStorybookMain({importMetaDirname: __dirname});
 * ```
 *
 * Adding another realm to a suite is as simple as appending its package name
 * to the `realmPackages` array — the helper resolves story paths automatically.
 */
import type {StorybookConfig} from '@storybook/react-vite';
import {createRequire} from 'node:module';
import {dirname, resolve} from 'node:path';
import {storybookBackend, storybookBackendDefine} from './storybookBackend.ts';

/**
 * Name of the app-only plugin that stubs a realm's `meta/fixture` modules.
 *
 * A literal rather than an import of `DROP_FIXTURES` from `./vite.ts`: Storybook
 * loads this module as raw ESM, where the app config's `.js`-for-`.ts` imports
 * do not resolve. Keep the two in step — the value is asserted against the plugin
 * it removes in `storybookMain.test.ts`.
 */
const DROP_FIXTURES = 'blong-drop-fixtures';

export interface IBlongStorybookMainOptions {
    /**
     * Absolute path of the `.storybook/` directory — pass `__dirname`.
     * Used to build the relative story globs and monorepo fs.allow paths.
     */
    importMetaDirname: string;
    /**
     * Additional stories globs relative to the package root (one level up from
     * `.storybook/`). Defaults to `['../src/**\/*.stories.@(ts|tsx)']`.
     */
    localStories?: string[];
    /**
     * npm package names whose `src/stories/` (or resolved story paths) should
     * be included. The helper resolves each package's location and appends its
     * stories to the `stories` array with correct absolute paths.
     *
     * Adding a realm to a suite:
     * ```ts
     * realmPackages: ['@feasibleone/blong-marine', '@feasibleone/my-realm'],
     * ```
     */
    realmPackages?: string[];
    /**
     * Additional Storybook addons. Merged after the defaults
     * (`@storybook/addon-a11y`).
     */
    extraAddons?: string[];
}

function getAbsolutePath(value: string, fromDir: string): string {
    return dirname(createRequire(fromDir + '/package.json').resolve(`${value}/package.json`));
}

function resolveRealmStories(packageName: string, fromDir: string): string[] {
    try {
        const pkgPath = createRequire(fromDir + '/package.json').resolve(
            `${packageName}/package.json`,
        );
        const realmRoot = dirname(pkgPath);
        return [`${realmRoot}/src/stories/**/*.stories.@(ts|tsx)`];
    } catch {
        console.warn(`[blong-browser/storybookMain] Could not resolve stories for ${packageName}`);
        return [];
    }
}

export function defineBlongStorybookMain(options: IBlongStorybookMainOptions): StorybookConfig {
    const {
        importMetaDirname,
        localStories = ['../src/**/*.stories.@(ts|tsx)'],
        realmPackages = [],
        extraAddons = [],
    } = options;

    const realmStories = realmPackages.flatMap(pkg => resolveRealmStories(pkg, importMetaDirname));

    const monorepoNodeModules = resolve(importMetaDirname, '../../../common/temp/node_modules');

    // Extra fs.allow entries for realm story file roots
    const realmRoots = realmPackages.flatMap(pkg => {
        try {
            const pkgPath = createRequire(importMetaDirname + '/package.json').resolve(
                `${pkg}/package.json`,
            );
            return [dirname(pkgPath)];
        } catch {
            return [];
        }
    });

    // Storybook dev servers reach assets by absolute path (`/@fs/<path>`), and a
    // path outside `server.fs.allow` is refused with 403 — which reads as a broken
    // theme rather than a config gap.  The list cannot be assembled from the
    // consumer package alone: a realm's stories import from blong-browser (which
    // owns the theme images), and a suite's from any realm it composes, none of
    // which is under `<package>/.storybook`.  So the monorepo root is allowed
    // too — the same reach Vite's own default (the workspace root) would give,
    // which setting `allow` at all otherwise discards.
    const monorepoRoot = resolve(importMetaDirname, '../../..');

    return {
        stories: [...localStories, ...realmStories],
        addons: [
            getAbsolutePath('@storybook/addon-a11y', importMetaDirname),
            ...extraAddons.map(a => getAbsolutePath(a, importMetaDirname)),
        ],
        framework: {
            name: getAbsolutePath(
                '@storybook/react-vite',
                importMetaDirname,
            ) as '@storybook/react-vite',
            options: {},
        },
        typescript: {
            reactDocgen: 'react-docgen-typescript',
        },
        viteFinal(config) {
            return {
                ...config,
                // Storybook is the one build that wants a realm's fixtures: an app
                // build stubs every `meta/fixture` module (`defineBlongViteConfig`
                // installs the plugin), and Storybook resolves the project's own
                // `vite.config.ts` into this one — verified by removing the stub by
                // hand and watching the fixture leave the Storybook bundle too.
                plugins: (config.plugins ?? [])
                    .flat()
                    .filter(plugin => (plugin as {name?: string})?.name !== DROP_FIXTURES)
                    // The live-backend toolbar: mints a token per role and, in the
                    // JSON-RPC mode, terminates `/rpc` for the page.  Inert in a
                    // build, where `configureServer` never runs.
                    .concat(storybookBackend()),
                define: {
                    ...config.define,
                    'process.env': {},
                    ...storybookBackendDefine(),
                },
                resolve: {
                    ...config.resolve,
                    conditions: ['development', ...(config.resolve?.conditions ?? [])],
                    dedupe: ['react', 'react-dom'],
                },
                server: {
                    ...config.server,
                    fs: {
                        ...config.server?.fs,
                        allow: [
                            // Whatever the project's own vite config already allows.
                            ...(config.server?.fs?.allow ?? []),
                            resolve(importMetaDirname, '..'),
                            monorepoRoot,
                            monorepoNodeModules,
                            ...realmRoots,
                        ],
                    },
                },
            };
        },
    };
}
