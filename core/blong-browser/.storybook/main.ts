// This file has been automatically migrated to valid ESM format by Storybook.
import type {StorybookConfig} from '@storybook/react-vite';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const __filename = fileURLToPath(import.meta.url);

const __dirname = dirname(fileURLToPath(import.meta.url));

const config: StorybookConfig = {
    stories: ['../src/**/*.stories.@(ts|tsx)'],
    addons: [getAbsolutePath('@storybook/addon-a11y'), getAbsolutePath('@storybook/addon-docs')],
    /**
     * `public/` is served at the root of the preview, which is where the feedback
     * mode's sherpa story expects its runtime: the adapter at
     * `/speech/sherpawAdapter.js` is loaded with `import()` rather than bundled,
     * because it is a WebAssembly runtime a page fetches, not a module the
     * library ships (`T-612`).
     */
    staticDirs: [{from: '../public', to: '/'}],
    framework: {
        name: getAbsolutePath('@storybook/react-vite') as '@storybook/react-vite',
        options: {},
    },
    typescript: {
        reactDocgen: 'react-docgen-typescript',
    },
    viteFinal(config) {
        return {
            ...config,
            define: {
                ...config.define,
                'process.env': {},
            },
            resolve: {
                ...config.resolve,
                dedupe: ['react', 'react-dom'],
            },
            server: {
                ...config.server,
                fs: {
                    // Allow Vite to serve files from the Rush pnpm virtual store
                    // (needed for fonts/assets in packages like primeicons).
                    // __dirname is .storybook/ → 3 levels up reaches the monorepo root.
                    allow: ['..', resolve(__dirname, '../../../common/temp/node_modules')],
                },
            },
        };
    },
};

export default config;

function getAbsolutePath(value: string): string {
    return dirname(fileURLToPath(import.meta.resolve(`${value}/package.json`)));
}
