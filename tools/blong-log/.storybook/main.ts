import type {StorybookConfig} from '@storybook/react-vite';
import {dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const config: StorybookConfig = {
    stories: ['../src/**/*.stories.@(ts|tsx)'],
    addons: [getAbsolutePath('@storybook/addon-a11y'), getAbsolutePath('@storybook/addon-docs')],
    framework: {
        name: getAbsolutePath('@storybook/react-vite'),
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
            plugins: [
                ...(config.plugins ?? []).flat(),
                // The vendor grid's six `cdn.svar.dev` `@font-face` rules, dropped from the
                // stylesheet the stories carry, as the portal and the standalone bundle do —
                // a page attempts them merely for being declared (`@@D-1033`). The rule is the
                // one in `core/blong-browser/src/vendorFontFaces.ts`, repeated here because
                // this package builds its Storybook without the framework's Vite factory.
                {
                    name: 'blong-strip-vendor-font-faces',
                    enforce: 'pre' as const,
                    transform(code: string, id: string) {
                        const file = id.split('?')[0] ?? '';
                        if (!file.endsWith('.css') || !code.includes('cdn.svar.dev')) return null;
                        return {
                            code: code.replace(/@font-face\s*\{[^}]*\}/gi, face =>
                                face.includes('cdn.svar.dev') ? '' : face,
                            ),
                            map: null,
                        };
                    },
                },
            ],
        };
    },
};

export default config;

function getAbsolutePath(value: string): string {
    return dirname(fileURLToPath(import.meta.resolve(`${value}/package.json`)));
}
