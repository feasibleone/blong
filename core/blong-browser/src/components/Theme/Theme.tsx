/* spell-checker: disable */
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
import './wood-assets.css';
import './wood.css';

import { addLocale, locale } from '../../primereact/index.js';
import { updateGlassReflections } from './glassReflection.js';
import {
    FALLBACK_THEME_OPTION,
    loadThemeCss,
    paletteOfFolder,
    resolveThemeFolder,
    themeOptionByFolder,
    themeOptionById,
    themeOptionByName,
    type IPrimeThemeOption,
} from './themeRegistry.js';

import { createContext, use, useCallback, useEffect, useRef, type ReactNode } from 'react';
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
export type ThemeVariant = 'standard' | 'glass' | 'wood';

/**
 * Maps each visual variant to a CSS file + the root marker used to style
 * portal overlays that mount outside the `.blong-app-*` wrapper.
 */
const VARIANT_CSS_CLASS: Record<Exclude<ThemeVariant, 'standard'>, string> = {
    glass: 'blong-app-glass',
    wood: 'blong-app-wood',
};

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
    // Visual variant layered on top of the base palette theme. Defaults to 'standard'.
    variant?: ThemeVariant;
    /**
     * Explicit theme selection — either a theme-option id (`lara-blue`,
     * `glass`) or a PrimeReact theme folder name (`lara-dark-blue`). When set
     * it overrides the `type` + `palette` mapping below. The theme switcher
     * writes its choice to the app store, which outranks this default.
     */
    name?: string;
    /**
     * Whether to render the theme switcher in the portal menubar.
     * Defaults to `true` — set `false` to hide it for an app.
     */
    switcher?: boolean;
    /** Override the font size (px). Defaults to palette-based size. */
    fontSize?: number;
    /**
     * Custom PrimeReact locale data per language code.
     * Each entry is registered via addLocale(lang, options).
     * Only needed for locales not already bundled with PrimeReact.
     */
    languages?: Record<string, object>;
}

/**
 * Effective theme state exposed to descendants (notably the theme switcher in
 * the portal menubar). `selectTheme` / `selectPalette` persist the choice via
 * `appStore.setTheme`.
 */
export interface IThemeContextValue {
    /** Effective configuration (prop defaults merged with the user's choice). */
    config: IThemeConfig;
    /** Resolved theme-option id. */
    optionId: string;
    /** Resolved theme-option descriptor. */
    option: IPrimeThemeOption;
    /** Effective palette. */
    palette: PaletteType;
    /** True when the current theme offers both light and dark variants. */
    paletteToggle: boolean;
    /** Whether the theme switcher should render (`IThemeConfig.switcher`). */
    switcher: boolean;
    /** Select a theme option by id. */
    selectTheme: (themeId: string) => void;
    /** Select the light/dark palette for the current theme. */
    selectPalette: (palette: PaletteType) => void;
}

const ThemeContext = createContext<IThemeContextValue | null>(null);

/**
 * Access the effective theme and the switcher setters from any descendant of
 * `<Theme>` (e.g. the portal menubar's theme switcher).
 */
export function useTheme(): IThemeContextValue {
    const context = use(ThemeContext);
    if (!context) throw new Error('useTheme must be used within <Theme>');
    return context;
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
    const selection = useAppStore(s => s.theme);
    const setTheme = useAppStore(s => s.setTheme);

    // Base theme from the config: the legacy type/palette mapping, optionally
    // overridden by an explicit `name` (theme-option id or folder name).
    const defaultFolder = PRIMEREACT_PALETTE_THEMES[type][palette];
    const named = theme.name ? themeOptionByName(theme.name) : undefined;
    const baseFolder =
        named && !named.option.variant ? resolveThemeFolder(named.option, named.palette) : defaultFolder;
    const basePalette = named?.palette ?? paletteOfFolder(defaultFolder) ?? palette;

    // The option implied by the config — used until the user picks one. The
    // `variant` prop keeps working for callers that only set glass/wood.
    const configOption: IPrimeThemeOption =
        named?.option ??
        (theme.variant && theme.variant !== 'standard'
            ? themeOptionById(theme.variant)
            : undefined) ??
        themeOptionByFolder(baseFolder) ??
        FALLBACK_THEME_OPTION;

    // The user's explicit choice (theme switcher) outranks the configured default.
    const option =
        (selection.themeId ? themeOptionById(selection.themeId) : undefined) ?? configOption;

    const isBlongVariant = option.variant !== undefined;
    const paletteToggle = Boolean(option.light && option.dark);
    const preferredPalette = selection.palette ?? basePalette;
    const activePalette: PaletteType = isBlongVariant
        ? basePalette
        : option.light && option.dark
          ? preferredPalette
          : option.dark
            ? 'dark'
            : 'light';
    const variant: ThemeVariant = option.variant ?? 'standard';
    const folder = isBlongVariant ? baseFolder : resolveThemeFolder(option, activePalette);

    const selectTheme = useCallback(
        (themeId: string) => {
            const next = themeOptionById(themeId);
            if (!next) return;
            if (next.variant) {
                setTheme({themeId});
                return;
            }
            const nextPalette: PaletteType =
                next.light && next.dark ? activePalette : next.dark ? 'dark' : 'light';
            setTheme({themeId, palette: nextPalette});
        },
        [setTheme, activePalette],
    );
    const selectPalette = useCallback(
        (nextPalette: PaletteType) => setTheme({themeId: option.id, palette: nextPalette}),
        [setTheme, option.id],
    );

    // Portal overlays (dropdowns, panels) mount OUTSIDE the `.blong-app-*`
    // wrapper, so expose a root marker class that the variant CSS can scope
    // those overlays to (e.g. `blong-theme-glass`).
    const rootMarker =
        variant === 'standard' ? null : `blong-theme-${variant}`;
    useEffect(() => {
        if (!rootMarker) return undefined;
        const root = document.documentElement;
        root.classList.add(rootMarker);
        return () => root.classList.remove(rootMarker);
    }, [rootMarker]);

    // Glass variant: keep each panel's `--glare-shift` in sync with its
    // vertical position so the single light ray stays continuous (no
    // hardcoded per-card classes). Disposed automatically when the variant
    // changes or the component unmounts.
    const glassActive = variant === 'glass';
    useEffect(() => {
        if (!glassActive) return undefined;
        const node = appRef.current;
        if (!node) return undefined;
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
    }, [theme.direction, theme.fontSize, theme.primary, type]);

    // Load the active PrimeReact theme into a single <style> element. Writing
    // the CSS in place keeps exactly one theme active — a side-effect CSS import
    // is only ever injected once, so revisiting a theme would otherwise keep
    // losing to a later-loaded one.
    useEffect(() => {
        let cancelled = false;
        loadThemeCss(folder)
            .then(css => {
                if (cancelled || !css || typeof document === 'undefined') return;
                let element = document.getElementById('blong-prime-theme') as HTMLStyleElement | null;
                if (!element) {
                    element = document.createElement('style');
                    element.id = 'blong-prime-theme';
                    document.head.appendChild(element);
                }
                element.textContent = css;
            })
            .catch(() => {
                // Keep the previously applied theme if a chunk fails to load.
            });
        return () => {
            cancelled = true;
        };
    }, [folder]);

    const contextValue: IThemeContextValue = {
        config: {...theme, palette: activePalette, variant},
        optionId: option.id,
        option,
        palette: activePalette,
        paletteToggle,
        switcher: theme.switcher ?? true,
        selectTheme,
        selectPalette,
    };

    return (
        <ThemeContext value={contextValue}>
            <div
                ref={appRef}
                className={[
                    'blong-app',
                    `blong-app-${activePalette}`,
                    `blong-app-${type}`,
                    variant !== 'standard' ? VARIANT_CSS_CLASS[variant] : '',
                    theme.direction === 'rtl' ? 'blong-app-rtl' : '',
                ]
                    .filter(Boolean)
                    .join(' ')}
                dir={theme.direction ?? 'ltr'}
            >
                {children}
            </div>
        </ThemeContext>
    );
}
