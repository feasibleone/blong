import type {Preview} from '@storybook/react-vite';
import React from 'react';
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
        theme: 'lara-dark',
    },
    decorators: [
        (Story, context) => {
            const themeName = context.globals['theme'] as string | undefined;
            if (themeName) applyThemeCss(themeName);
            // Pass key={themeName} to force remount when the toolbar theme changes,
            // ensuring ThemeProvider's internal state stays in sync with the selection.
            return React.createElement(
                ThemeProvider,
                {key: themeName ?? 'lara-dark', initialThemeName: themeName ?? 'lara-dark'},
                // Wrap in a div that reads the active PrimeReact surface tokens so all
                // stories render on the correct themed background and text color —
                // Storybook's own canvas background is separate and stays white otherwise.
                React.createElement(
                    'div',
                    {
                        style: {
                            background: 'var(--surface-ground, #111827)',
                            color: 'var(--text-color, rgba(255,255,255,0.87))',
                            minHeight: '100vh',
                            padding: '1rem',
                        },
                    },
                    React.createElement(Story),
                ),
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
        // 'fullscreen' removes Storybook's own padded white canvas so the decorator's
        // dark surface-ground wrapper covers the entire iframe without a white border.
        layout: 'fullscreen',
    },
};

export default preview;
