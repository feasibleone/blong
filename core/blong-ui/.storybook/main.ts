import type {StorybookConfig} from '@storybook/react-vite';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const config: StorybookConfig = {
    stories: [
        '../src/**/*.stories.@(ts|tsx)',
        '../src/**/*.mdx',
        '../stories/**/*.stories.@(ts|tsx)',
        '../stories/**/*.mdx',
    ],
    addons: [getAbsolutePath('@storybook/addon-a11y'), getAbsolutePath('@storybook/addon-docs')],
    framework: {
        name: getAbsolutePath('@storybook/react-vite'),
        options: {},
    },
    typescript: {
        reactDocgen: 'react-docgen-typescript',
    },
    // Serve PrimeReact theme CSS files so applyThemeCss() works in both the
    // dev server and the static build used by the test-runner for snapshots.
    staticDirs: [
        {
            from: resolve(
                dirname(fileURLToPath(import.meta.url)),
                '../../../common/temp/node_modules/.pnpm/primereact@10.9.7_@types+react@18.3.28_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/primereact/resources/themes',
            ),
            to: '/node_modules/primereact/resources/themes',
        },
    ],
    viteFinal(config) {
        return {
            ...config,
            define: {
                ...config.define,
                'process.env': {},
            },
        };
    },
};

export default config;

function getAbsolutePath(value: string): any {
    return dirname(fileURLToPath(import.meta.resolve(`${value}/package.json`)));
}
