import {resolve} from 'node:path';
import {describe, expect, it} from 'vitest';
import {defineBlongStorybookMain} from './storybookMain.js';
import {DROP_FIXTURES} from './vite.js';

/**
 * The app config and the Storybook config disagree about fixtures on purpose:
 * `defineBlongViteConfig` stubs every `meta/fixture` module (a realm's fixtures
 * are Storybook's data, and a glob in a bundled entry cannot be conditional),
 * while Storybook removes that stub so the real rows load. The two only agree if
 * the name Storybook filters on is the name the app config installs — a literal
 * in each file, because Storybook loads `storybookMain.ts` as raw ESM and cannot
 * import `vite.ts`. This is the assertion that keeps them in step.
 */
describe('defineBlongStorybookMain', () => {
    const pluginsOf = (plugins: unknown[]) =>
        // `process.cwd()` is this package, so the addon/framework paths the
        // factory resolves eagerly resolve the way they do in a real config.
        (
            defineBlongStorybookMain({importMetaDirname: process.cwd()}).viteFinal as (
                config: unknown,
            ) => {plugins: unknown[]}
        )({plugins}).plugins as Array<{name?: string}>;

    it('removes the app-only fixture stub, keeping every other plugin', () => {
        const plugins = pluginsOf([
            {name: DROP_FIXTURES},
            {name: 'react'},
            {name: 'blong-drop-fixtures-elsewhere'},
        ]);
        expect(plugins.map(plugin => plugin.name).slice(0, 2)).toEqual([
            'react',
            'blong-drop-fixtures-elsewhere',
        ]);
    });

    it('appends the live-backend plugin the toolbar needs', () => {
        expect(pluginsOf([]).map(plugin => plugin.name)).toEqual(['blong-storybook-backend']);
    });

    /**
     * A Storybook dev server reaches an asset by absolute path, and a path outside
     * `server.fs.allow` is answered with 403 — which shows up as a theme whose
     * images are missing, not as a config gap. The list has to cover more than the
     * package being served: a realm's stories import blong-browser's theme images,
     * and they live outside the realm.
     */
    describe('server.fs.allow', () => {
        // A real `.storybook/` sits one level below the package root, so the
        // monorepo root is two levels above it (packages are at category/package).
        const allowOf = (config: unknown): string[] => {
            const main = defineBlongStorybookMain({
                importMetaDirname: resolve(process.cwd(), '.storybook'),
            });
            return (main.viteFinal as (c: unknown) => {server: {fs: {allow: string[]}}})(config)
                .server.fs.allow;
        };

        it('covers the served package, the monorepo and the shared node_modules', () => {
            const allow = allowOf({});
            expect(allow).toContain(process.cwd());
            expect(allow).toContain(resolve(process.cwd(), '../..'));
            expect(allow).toContain(
                resolve(process.cwd(), '.storybook/../../../common/temp/node_modules'),
            );
        });

        it('keeps whatever the project vite config already allowed', () => {
            const allow = allowOf({server: {fs: {allow: ['/custom/root']}}});
            expect(allow).toContain('/custom/root');
        });
    });
});
