/**
 * useDarkMode — toggle dark mode with localStorage persistence.
 */
import {useCallback, useMemo} from 'react';
import {useLocalStorage} from './useLocalStorage.js';

export interface IUseDarkModeResult {
    isDark: boolean;
    toggle: () => void;
    setDark: (dark: boolean) => void;
}

export function useDarkMode(): IUseDarkModeResult {
    const [isDark, setIsDark] = useLocalStorage('blong-browser-dark-mode', false);

    const toggle = useCallback(() => setIsDark(prev => !prev), [setIsDark]);

    // Kept as one object because the identity is part of what this hook hands out,
    // not an implementation detail: a consumer that puts the result in a dependency
    // list (an effect that also writes state, a `useMemo`, a `React.memo` prop)
    // compares it, and a fresh object per render makes that comparison always true —
    // the effect re-runs after every render, forever. It changes when the theme does,
    // and only then.
    return useMemo(() => ({isDark, toggle, setDark: setIsDark}), [isDark, toggle, setIsDark]);
}
