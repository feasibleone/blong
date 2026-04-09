/**
 * Theme — PrimeReact theming provider.
 *
 *   light, dark, big         → lara-light-blue / lara-dark-blue
 *   compact, light-compact   → saga-blue / vela-blue
 *   dark-compact             → vela-blue / saga-blue
 *
 * CSS for PrimeReact themes must be loaded by the consumer. Use
 * PRIMEREACT_PALETTE_THEMES to look up which CSS file to load for a
 * given palette + dark-mode combination.
 */
import {addLocale, locale} from '../../primereact/index.js';

import {type ReactNode, useEffect} from 'react';
import {useAppStore} from '../../state/appStore.js';

export type PaletteType = 'light' | 'dark' | 'big' | 'compact' | 'light-compact' | 'dark-compact';

/**
 * Maps each palette to the PrimeReact theme name for light and dark modes.
 * Theme CSS is at: `primereact/resources/themes/<name>/theme.css`
 */
export const PRIMEREACT_PALETTE_THEMES: Record<PaletteType, {light: string; dark: string}> = {
    light: {light: 'lara-light-blue', dark: 'lara-dark-blue'},
    dark: {light: 'lara-light-blue', dark: 'lara-dark-blue'},
    big: {light: 'lara-light-blue', dark: 'lara-dark-blue'},
    compact: {light: 'saga-blue', dark: 'vela-blue'},
    'light-compact': {light: 'saga-blue', dark: 'vela-blue'},
    'dark-compact': {light: 'vela-blue', dark: 'saga-blue'},
};

/** Font size in px for each palette — compact variants use 14, others 16. */
export const PALETTE_FONT_SIZES: Record<PaletteType, number> = {
    light: 16,
    dark: 16,
    big: 16,
    compact: 14,
    'light-compact': 14,
    'dark-compact': 14,
};

export interface IThemeConfig {
    name: string;
    palette?: PaletteType;
    direction?: 'ltr' | 'rtl';
    primary?: string;
    /** Override the font size (px). Defaults to palette-based size. */
    fontSize?: number;
    /**
     * Custom PrimeReact locale data per language code.
     * Each entry is registered via addLocale(lang, options).
     * Only needed for locales not already bundled with PrimeReact.
     */
    languages?: Record<string, object>;
}

interface IThemeProps {
    theme: IThemeConfig;
    children: ReactNode;
}

export function Theme({theme, children}: IThemeProps) {
    const language = useAppStore(s => s.language);

    useEffect(() => {
        if (theme.languages) {
            for (const [lang, options] of Object.entries(theme.languages)) {
                addLocale(lang, options as Parameters<typeof addLocale>[1]);
            }
        }
    }, [theme.languages]);

    useEffect(() => {
        locale(language && language !== 'en' ? language : 'en');
    }, [language]);

    useEffect(() => {
        const palette = theme.palette ?? 'dark-compact';
        const fontSize = theme.fontSize ?? PALETTE_FONT_SIZES[palette];

        // Apply direction
        document.documentElement.dir = theme.direction ?? 'ltr';
        document.documentElement.lang = theme.direction === 'rtl' ? 'ar' : 'en';

        // Apply font size
        document.documentElement.style.fontSize = `${fontSize}px`;

        // Apply custom primary color via CSS variable
        if (theme.primary) {
            document.documentElement.style.setProperty('--p-primary-color', theme.primary);
        }
    }, [theme]);

    const palette = theme.palette ?? 'dark-compact';
    return (
        <div
            className={[
                'blong-app',
                `blong-app--${palette}`,
                theme.direction === 'rtl' ? 'blong-app--rtl' : '',
            ]
                .filter(Boolean)
                .join(' ')}
            dir={theme.direction ?? 'ltr'}
        >
            {children}
        </div>
    );
}
