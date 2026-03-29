import React from 'react';
import type {Preview} from '@storybook/react-vite';
import {ThemeProvider} from '../src/components/ThemeProvider.js';
import {applyThemeCss, getThemeEntry, getThemeNames} from '../src/themes/registry.js';

const preview: Preview = {
    globalTypes: {
        theme: {
            description: 'PrimeReact theme preset',
            toolbar: {
                title: 'Theme',
                icon: 'paintbrush',
                items: getThemeNames().map(name => ({
                    value: name,
                    title: getThemeEntry(name)?.label ?? name,
                })),
                dynamicTitle: true,
            },
        },
    },
    initialGlobals: {
        theme: 'lara-light',
    },
    decorators: [
        (Story, context) => {
            const themeName = context.globals['theme'] as string | undefined;
            if (themeName) applyThemeCss(themeName);
            // Pass key={themeName} to force remount when the toolbar theme changes,
            // ensuring ThemeProvider's internal state stays in sync with the selection.
            return React.createElement(
                ThemeProvider,
                {key: themeName ?? 'lara-light', initialThemeName: themeName ?? 'lara-light'},
                React.createElement(Story),
            );
        },
    ],
    parameters: {
        controls: {
            matchers: {
                color: /(background|color)$/i,
                date: /Date$/i,
            },
        },
        layout: 'padded',
    },
};

export default preview;
