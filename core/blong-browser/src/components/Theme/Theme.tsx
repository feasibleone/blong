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
import './glass.css';

import { addLocale, locale } from '../../primereact/index.js';
import { updateGlassReflections } from './glassReflection.js';

import { type ReactNode, useEffect, useRef } from 'react';
import { useAppStore } from '../../state/appStore.js';

export type PaletteType = 'light' | 'dark';
export type ThemeType = 'big' | 'compact';
/**
 * Visual variant layered on top of the selected palette theme:
 * - `standard` (default) — the plain PrimeReact theme.
 * - `glass` — high-contrast grayscale glass look layered on the palette
 *   theme (matte slate canvas, glossy charcoal panels with sharp skewed
 *   glares + 3D bevels, dark glass input plates, rectangular polished glass
 *   buttons, grayscale checkboxes and table rows). All glass rules live in
 *   `glass.css` and are scoped under the `blong-app-glass` class Theme adds
 *   to its wrapper, so the base theme stays intact unless `variant: 'glass'`
 *   is requested.
 */
export type ThemeVariant = 'standard' | 'glass';

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
    /** Visual variant layered on top of the base palette theme. Defaults to 'standard'. */
    variant?: ThemeVariant;
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
    const appRef = useRef<HTMLDivElement>(null);
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
    const variant = theme.variant ?? 'standard';

    // Glass variant: keep each panel's `--glare-shift` in sync with its
    // vertical position so the single light ray stays continuous (no
    // hardcoded per-card classes). Disposed automatically when the variant
    // changes or the component unmounts.
    const glassActive = variant === 'glass';
    useEffect(() => {
        if (!glassActive) return undefined;
        // Mark the document root so portal overlays (rendered outside the
        // `.blong-app-glass` wrapper) can be scoped to the glass theme too.
        const root = document.documentElement;
        root.classList.add('blong-theme-glass');
        const node = appRef.current;
        if (!node) {
            root.classList.remove('blong-theme-glass');
            return undefined;
        }
        // Recompute each panel's `--glare-shift` from its vertical position so
        // the single light ray stays continuous across the whole layout. A
        // short interval + resize listener keep it correct even when panels
        // mount asynchronously (e.g. after auth/session restore in a story).
        updateGlassReflections(node);
        const refresh = () => updateGlassReflections(node);
        const interval = window.setInterval(refresh, 250);
        window.addEventListener('resize', refresh);
        window.addEventListener('load', refresh);
        return () => {
            root.classList.remove('blong-theme-glass');
            window.clearInterval(interval);
            window.removeEventListener('resize', refresh);
            window.removeEventListener('load', refresh);
        };
    }, [glassActive]);

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
            ref={appRef}
            className={[
                'blong-app',
                `blong-app-${palette}`,
                `blong-app-${type}`,
                variant === 'glass' ? 'blong-app-glass' : '',
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
