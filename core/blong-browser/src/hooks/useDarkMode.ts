/**
 * useDarkMode — toggle dark mode with localStorage persistence.
 */
import {useCallback} from 'react';
import {useLocalStorage} from './useLocalStorage.js';

export interface IUseDarkModeResult {
    isDark: boolean;
    toggle: () => void;
    setDark: (dark: boolean) => void;
}

export function useDarkMode(): IUseDarkModeResult {
    const [isDark, setIsDark] = useLocalStorage('blong-browser-dark-mode', false);

    const toggle = useCallback(() => setIsDark(prev => !prev), [setIsDark]);

    return {isDark, toggle, setDark: setIsDark};
}
