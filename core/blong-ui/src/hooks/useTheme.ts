/**
 * useTheme — PrimeReact theme management.
 *
 * Manages the active PrimeReact theme (light/dark mode, design tokens).
 */

import {createContext, useCallback, useContext, useEffect, useState} from 'react';

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
    const [systemDark, setSystemDark] = useState(() =>
        typeof window !== 'undefined'
            ? window.matchMedia('(prefers-color-scheme: dark)').matches
            : false,
    );

    // Listen for system color scheme changes
    useEffect(() => {
        if (typeof window === 'undefined') return;
        const mql = window.matchMedia('(prefers-color-scheme: dark)');
        const handler = (e: MediaQueryListEvent): void => setSystemDark(e.matches);
        mql.addEventListener('change', handler);
        return () => mql.removeEventListener('change', handler);
    }, []);

    const isDark = mode === 'dark' || (mode === 'system' && systemDark);

    const setMode = useCallback((newMode: ThemeMode) => {
        setModeState(newMode);
    }, []);

    return {mode, setMode, isDark};
}
