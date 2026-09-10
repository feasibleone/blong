import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import type {StorybookConfig} from '@storybook/react-vite';

const config: StorybookConfig = {
    stories: ['../src/**/*.stories.@(ts|tsx)'],
    addons: [getAbsolutePath("@storybook/addon-a11y"), getAbsolutePath("@storybook/addon-docs")],
    framework: {
        name: getAbsolutePath("@storybook/react-vite"),
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
        };
    },
};

export default config;

function getAbsolutePath(value: string): string {
    return dirname(fileURLToPath(import.meta.resolve(`${value}/package.json`)));
}
