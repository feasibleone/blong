/**
 * useTheme — PrimeReact theme management.
 *
 * Manages the active PrimeReact theme (light/dark mode, design tokens).
 */

import {createContext, useCallback, useContext, useState} from 'react';

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
}

const defaultValue: ThemeContextValue = {
    mode: 'system',
    setMode: () => {},
    isDark: false,
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
export function useThemeProvider(initial: ThemeMode = 'system'): ThemeContextValue {
    const [mode, setModeState] = useState<ThemeMode>(initial);

    const systemDark =
        typeof window !== 'undefined'
            ? window.matchMedia('(prefers-color-scheme: dark)').matches
            : false;

    const isDark = mode === 'dark' || (mode === 'system' && systemDark);

    const setMode = useCallback((newMode: ThemeMode) => {
        setModeState(newMode);
    }, []);

    return {mode, setMode, isDark};
}
