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
import 'primeflex/primeflex.css';
import 'primeicons/primeicons.css';
import 'primereact/resources/primereact.min.css';

import {addLocale, locale} from '../../primereact/index.js';

import {type ReactNode, useEffect} from 'react';
import {useAppStore} from '../../state/appStore.js';

export type PaletteType = 'light' | 'dark';
export type ThemeType = 'big' | 'compact';

/**
 * Maps each palette to the PrimeReact theme name for light and dark modes.
 * Theme CSS is at: `primereact/resources/themes/<name>/theme.css`
 */
export const PRIMEREACT_PALETTE_THEMES: Record<ThemeType, Record<PaletteType, string>> = {
    big: {light: 'lara-light-blue', dark: 'lara-dark-blue'},
    compact: {light: 'saga-blue', dark: 'vela-blue'},
};

/** Font size in px for each palette — compact variants use 14, others 16. */
export const PALETTE_FONT_SIZES: Record<ThemeType, number> = {
    big: 16,
    compact: 14,
};

export interface IThemeConfig {
    type?: ThemeType;
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

    const palette = theme.palette ?? 'dark';
    const type = theme.type ?? 'compact';
    useEffect(() => {
        const fontSize = theme.fontSize ?? PALETTE_FONT_SIZES[type];

        // Apply direction
        document.documentElement.dir = theme.direction ?? 'ltr';
        document.documentElement.lang = theme.direction === 'rtl' ? 'ar' : 'en';

        // Apply font size
        document.documentElement.style.fontSize = `${fontSize}px`;

        // Apply custom primary color via CSS variable
        if (theme.primary) {
            document.documentElement.style.setProperty('--p-primary-color', theme.primary);
        }
        switch (PRIMEREACT_PALETTE_THEMES[type][palette] || 'vela-blue') {
            case 'vela-blue':
                import('primereact/resources/themes/vela-blue/theme.css');
                break;
            case 'saga-blue':
                import('primereact/resources/themes/saga-blue/theme.css');
                break;
            case 'lara-light-blue':
                import('primereact/resources/themes/lara-light-blue/theme.css');
                break;
            case 'lara-dark-blue':
                import('primereact/resources/themes/lara-dark-blue/theme.css');
                break;
        }
    }, [palette, theme.direction, theme.fontSize, theme.primary, type]);

    return (
        <div
            className={[
                'blong-app',
                `blong-app-${palette}`,
                `blong-app-${type}`,
                theme.direction === 'rtl' ? 'blong-app-rtl' : '',
            ]
                .filter(Boolean)
                .join(' ')}
            dir={theme.direction ?? 'ltr'}
        >
            {children}
        </div>
    );
}
