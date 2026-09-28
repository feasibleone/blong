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
        expect(plugins.map(plugin => plugin.name)).toEqual([
            'react',
            'blong-drop-fixtures-elsewhere',
        ]);
    });

    it('tolerates a config with no plugins', () => {
        expect(pluginsOf([])).toEqual([]);
    });
});
