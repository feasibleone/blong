/**
 * ThemeProvider — PrimeReact design tokens, dark/light mode support.
 *
 * Wraps the application with theme context and applies the active theme.
 */

import React, {useEffect} from 'react';

import {ThemeContext, useThemeProvider} from '../hooks/useTheme.js';
import type {ThemeMode} from '../hooks/useTheme.js';

/** Props for the ThemeProvider component. */
export interface ThemeProviderProps {
    children: React.ReactNode;
    /** Initial theme mode (default: 'system'). */
    initialMode?: ThemeMode;
    /** CSS class prefix for theme scoping. */
    classPrefix?: string;
}

/**
 * ThemeProvider — provides theme context and applies CSS classes.
 *
 * @example
 * ```tsx
 * <ThemeProvider initialMode="dark">
 *     <App />
 * </ThemeProvider>
 * ```
 */
export function ThemeProvider({
    children,
    initialMode = 'system',
    classPrefix = 'blong',
}: ThemeProviderProps): React.ReactElement {
    const themeValue = useThemeProvider(initialMode);

    // Apply theme class to document root
    useEffect(() => {
        const root = document.documentElement;
        root.classList.remove(`${classPrefix}-light`, `${classPrefix}-dark`);
        root.classList.add(`${classPrefix}-${themeValue.isDark ? 'dark' : 'light'}`);

        // Update color-scheme meta
        root.style.colorScheme = themeValue.isDark ? 'dark' : 'light';
    }, [themeValue.isDark, classPrefix]);

    return React.createElement(
        ThemeContext.Provider,
        {value: themeValue},
        children,
    );
}

/**
 * ThemeToggle — button to cycle through light/dark/system modes.
 */
export function ThemeToggle({
    className = '',
}: {
    className?: string;
}): React.ReactElement {
    const themeValue = useThemeProvider();

    const icons: Record<ThemeMode, string> = {
        light: '☀️',
        dark: '🌙',
        system: '💻',
    };

    const nextMode: Record<ThemeMode, ThemeMode> = {
        light: 'dark',
        dark: 'system',
        system: 'light',
    };

    return React.createElement(
        'button',
        {
            className: `blong-theme-toggle ${className}`,
            onClick: () => themeValue.setMode(nextMode[themeValue.mode]),
            title: `Theme: ${themeValue.mode}`,
            type: 'button',
        },
        icons[themeValue.mode],
    );
}
