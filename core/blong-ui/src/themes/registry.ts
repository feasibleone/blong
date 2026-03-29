/**
 * PrimeReact theme registry.
 *
 * Maps theme names to their CSS paths from the primereact package.
 * Themes are loaded dynamically by ThemeProvider when the active theme changes.
 */

/** A registered PrimeReact theme entry. */
export interface ThemeEntry {
    /** Display name for the theme. */
    label: string;
    /** CSS path relative to primereact/resources/themes/. */
    cssPath: string;
    /** Whether this is a dark theme. */
    dark?: boolean;
}

/** Registry of available themes. */
const themeRegistry: Map<string, ThemeEntry> = new Map([
    ['lara-light', {label: 'Lara Light', cssPath: 'lara-light-blue/theme.css'}],
    ['lara-dark', {label: 'Lara Dark', cssPath: 'lara-dark-blue/theme.css', dark: true}],
    ['aura-light', {label: 'Aura Light', cssPath: 'aura-light/theme.css'}],
    ['aura-dark', {label: 'Aura Dark', cssPath: 'aura-dark/theme.css', dark: true}],
]);

/**
 * Register a custom theme.
 *
 * @example
 * ```ts
 * registerTheme('my-theme', {
 *     label: 'My Custom Theme',
 *     cssPath: 'bootstrap4-light-blue/theme.css',
 * });
 * ```
 */
export function registerTheme(name: string, entry: ThemeEntry): void {
    themeRegistry.set(name, entry);
}

/** Get all registered theme names. */
export function getThemeNames(): string[] {
    return Array.from(themeRegistry.keys());
}

/** Get a theme entry by name. */
export function getThemeEntry(name: string): ThemeEntry | undefined {
    return themeRegistry.get(name);
}

/** Default theme name. */
export const DEFAULT_THEME_NAME = 'lara-light';

/** LocalStorage key for persisting theme choice. */
export const THEME_STORAGE_KEY = 'blong-theme-name';

/**
 * Apply a PrimeReact theme by injecting/swapping a CSS `<link>` element.
 * The link element uses id="blong-primereact-theme" for identification.
 *
 * @param themeName - Registered theme name (e.g., 'lara-light')
 * @param basePath - Base path for CSS files (default: '/node_modules/primereact/resources/themes/')
 */
export function applyThemeCss(themeName: string, basePath?: string): void {
    if (typeof document === 'undefined') return;

    const entry = themeRegistry.get(themeName);
    if (!entry) return;

    const base = basePath ?? '/node_modules/primereact/resources/themes/';
    const href = `${base}${entry.cssPath}`;

    const id = 'blong-primereact-theme';
    let link = document.getElementById(id) as HTMLLinkElement | null;

    if (!link) {
        link = document.createElement('link');
        link.id = id;
        link.rel = 'stylesheet';
        link.type = 'text/css';
        document.head.appendChild(link);
    }

    link.href = href;
}
