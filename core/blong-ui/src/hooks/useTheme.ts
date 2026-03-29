/**
 * useTheme — PrimeReact theme management.
 *
 * Manages the active PrimeReact theme (light/dark mode, design tokens).
 */

import {createContext, useCallback, useContext, useEffect, useState} from 'react';

import {
    applyThemeCss,
    DEFAULT_THEME_NAME,
    getThemeNames,
    THEME_STORAGE_KEY,
} from '../themes/registry.js';

/** Theme mode. */
export type ThemeMode = 'light' | 'dark' | 'system';

/** Theme context value. */
export interface ThemeContextValue {
    /** Current theme mode. */
    mode: ThemeMode;
    /** Set the theme mode. */
    setMode: (mode: ThemeMode) => void;
    /** Effective dark mode (resolved from system preference). */
    isDark: boolean;
    /** Active PrimeReact theme preset name (e.g., 'lara-light', 'aura-dark'). */
    themeName: string;
    /** Change the active PrimeReact theme preset. */
    setThemeName: (name: string) => void;
    /** List of all registered theme preset names. */
    availableThemes: string[];
}

const defaultValue: ThemeContextValue = {
    mode: 'system',
    setMode: () => {},
    isDark: false,
    themeName: DEFAULT_THEME_NAME,
    setThemeName: () => {},
    availableThemes: getThemeNames(),
};

export const ThemeContext = createContext<ThemeContextValue>(defaultValue);

/**
 * Hook to manage the PrimeReact theme mode.
 *
 * @example
 * ```tsx
 * const { mode, setMode, isDark } = useTheme();
 * ```
 */
export function useTheme(): ThemeContextValue {
    return useContext(ThemeContext);
}

/**
 * Hook to create the theme context value (used by providers).
 */
export function useThemeProvider(
    initial: ThemeMode = 'system',
    initialThemeName?: string,
): ThemeContextValue {
    const [mode, setModeState] = useState<ThemeMode>(initial);
    const [systemDark, setSystemDark] = useState(() =>
        typeof window !== 'undefined'
            ? window.matchMedia('(prefers-color-scheme: dark)').matches
            : false,
    );

    const storedTheme =
        typeof localStorage !== 'undefined' ? localStorage.getItem(THEME_STORAGE_KEY) : null;
    const [themeName, setThemeNameState] = useState<string>(
        storedTheme ?? initialThemeName ?? DEFAULT_THEME_NAME,
    );

    // Listen for system color scheme changes
    useEffect(() => {
        if (typeof window === 'undefined') return;
        const mql = window.matchMedia('(prefers-color-scheme: dark)');
        const handler = (e: MediaQueryListEvent): void => setSystemDark(e.matches);
        mql.addEventListener('change', handler);
        return () => mql.removeEventListener('change', handler);
    }, []);

    // Apply theme CSS on mount and when themeName changes
    useEffect(() => {
        applyThemeCss(themeName);
    }, [themeName]);

    const isDark = mode === 'dark' || (mode === 'system' && systemDark);

    const setMode = useCallback((newMode: ThemeMode) => {
        setModeState(newMode);
    }, []);

    const setThemeName = useCallback((name: string) => {
        setThemeNameState(name);
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem(THEME_STORAGE_KEY, name);
        }
        applyThemeCss(name);
    }, []);

    return {
        mode,
        setMode,
        isDark,
        themeName,
        setThemeName,
        availableThemes: getThemeNames(),
    };
}
