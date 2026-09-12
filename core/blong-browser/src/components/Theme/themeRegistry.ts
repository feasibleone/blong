/* spell-checker: disable */
/**
 * themeRegistry — the catalogue of selectable themes for the blong-browser
 * theme switcher.
 *
 * Two kinds of entries:
 *  - **PrimeReact theme families** — a family groups the light/dark variants of
 *    a PrimeReact theme (e.g. `lara-light-blue` + `lara-dark-blue`). Families
 *    that ship a single variant (e.g. `saga-blue`, `vela-blue`) expose that one
 *    folder and get no light/dark toggle.
 *  - **blong visual variants** — `glass` and `wood`: CSS layers shipped with
 *    blong-browser (`glass.css` / `wood.css`) applied on top of a base
 *    PrimeReact theme. They have no light/dark variants.
 *
 * `THEME_LOADERS` maps each PrimeReact theme folder name to an `?inline` CSS
 * import. Theme writes the resolved CSS into a single `<style>` element, which
 * keeps exactly one theme active at a time. Loading themes as side-effect
 * imports (the previous approach) is not viable for a runtime switcher: an
 * already-imported theme module is never re-injected, so revisiting a theme
 * would leave a later-loaded theme winning.
 */

/** Matches `PaletteType` in `Theme.tsx` (kept local to avoid an import cycle). */
export type ThemePalette = 'light' | 'dark';

/** A blong visual variant layered on top of a base PrimeReact theme. */
export type BlongThemeVariant = 'glass' | 'wood';

/** One selectable entry in the theme switcher. */
export interface IPrimeThemeOption {
    /** Stable id — persisted in the app store and used as the dropdown value. */
    id: string;
    /** Human-readable label (a product/proper name, so not translated). */
    label: string;
    /** PrimeReact theme folder for the light variant (absent when unavailable). */
    light?: string;
    /** PrimeReact theme folder for the dark variant (absent when unavailable). */
    dark?: string;
    /** Set for blong-only variants (glass/wood); these have no light/dark pair. */
    variant?: BlongThemeVariant;
}

/** A dropdown group of related themes. */
export interface IThemeGroup {
    label: string;
    items: IPrimeThemeOption[];
}

/** Dropdown groups, in display order. Blong variants come first. */
export const THEME_GROUPS: IThemeGroup[] = [
    {
        label: 'Blong',
        items: [
            {id: 'glass', label: 'Glass', variant: 'glass'},
            {id: 'wood', label: 'Wood', variant: 'wood'},
        ],
    },
    {
        label: 'Lara',
        items: [
            {id: 'lara-amber', label: 'Lara Amber', light: 'lara-light-amber', dark: 'lara-dark-amber'},
            {id: 'lara-blue', label: 'Lara Blue', light: 'lara-light-blue', dark: 'lara-dark-blue'},
            {id: 'lara-cyan', label: 'Lara Cyan', light: 'lara-light-cyan', dark: 'lara-dark-cyan'},
            {id: 'lara-green', label: 'Lara Green', light: 'lara-light-green', dark: 'lara-dark-green'},
            {id: 'lara-indigo', label: 'Lara Indigo', light: 'lara-light-indigo', dark: 'lara-dark-indigo'},
            {id: 'lara-pink', label: 'Lara Pink', light: 'lara-light-pink', dark: 'lara-dark-pink'},
            {id: 'lara-purple', label: 'Lara Purple', light: 'lara-light-purple', dark: 'lara-dark-purple'},
            {id: 'lara-teal', label: 'Lara Teal', light: 'lara-light-teal', dark: 'lara-dark-teal'},
        ],
    },
    {
        label: 'Bootstrap 4',
        items: [
            {id: 'bootstrap4-blue', label: 'Bootstrap 4 Blue', light: 'bootstrap4-light-blue', dark: 'bootstrap4-dark-blue'},
            {id: 'bootstrap4-purple', label: 'Bootstrap 4 Purple', light: 'bootstrap4-light-purple', dark: 'bootstrap4-dark-purple'},
        ],
    },
    {
        label: 'Material',
        items: [
            {id: 'md-indigo', label: 'Material Indigo', light: 'md-light-indigo', dark: 'md-dark-indigo'},
            {id: 'md-deeppurple', label: 'Material Deep Purple', light: 'md-light-deeppurple', dark: 'md-dark-deeppurple'},
        ],
    },
    {
        label: 'Material Compact',
        items: [
            {id: 'mdc-indigo', label: 'Material Compact Indigo', light: 'mdc-light-indigo', dark: 'mdc-dark-indigo'},
            {id: 'mdc-deeppurple', label: 'Material Compact Deep Purple', light: 'mdc-light-deeppurple', dark: 'mdc-dark-deeppurple'},
        ],
    },
    {
        label: 'Soho',
        items: [{id: 'soho', label: 'Soho', light: 'soho-light', dark: 'soho-dark'}],
    },
    {
        label: 'Viva',
        items: [{id: 'viva', label: 'Viva', light: 'viva-light', dark: 'viva-dark'}],
    },
    {
        label: 'Arya',
        items: [
            {id: 'arya-blue', label: 'Arya Blue', dark: 'arya-blue'},
            {id: 'arya-green', label: 'Arya Green', dark: 'arya-green'},
            {id: 'arya-orange', label: 'Arya Orange', dark: 'arya-orange'},
            {id: 'arya-purple', label: 'Arya Purple', dark: 'arya-purple'},
        ],
    },
    {
        label: 'Luna',
        items: [
            {id: 'luna-amber', label: 'Luna Amber', dark: 'luna-amber'},
            {id: 'luna-blue', label: 'Luna Blue', dark: 'luna-blue'},
            {id: 'luna-green', label: 'Luna Green', dark: 'luna-green'},
            {id: 'luna-pink', label: 'Luna Pink', dark: 'luna-pink'},
        ],
    },
    {
        label: 'Saga',
        items: [
            {id: 'saga-blue', label: 'Saga Blue', light: 'saga-blue'},
            {id: 'saga-green', label: 'Saga Green', light: 'saga-green'},
            {id: 'saga-orange', label: 'Saga Orange', light: 'saga-orange'},
            {id: 'saga-purple', label: 'Saga Purple', light: 'saga-purple'},
        ],
    },
    {
        label: 'Vela',
        items: [
            {id: 'vela-blue', label: 'Vela Blue', dark: 'vela-blue'},
            {id: 'vela-green', label: 'Vela Green', dark: 'vela-green'},
            {id: 'vela-orange', label: 'Vela Orange', dark: 'vela-orange'},
            {id: 'vela-purple', label: 'Vela Purple', dark: 'vela-purple'},
        ],
    },
    {
        label: 'Other',
        items: [
            {id: 'fluent-light', label: 'Fluent Light', light: 'fluent-light'},
            {id: 'mira', label: 'Mira', light: 'mira'},
            {id: 'nano', label: 'Nano', light: 'nano'},
            {id: 'nova', label: 'Nova', light: 'nova'},
            {id: 'nova-accent', label: 'Nova Accent', light: 'nova-accent'},
            {id: 'nova-alt', label: 'Nova Alt', light: 'nova-alt'},
            {id: 'rhea', label: 'Rhea', light: 'rhea'},
            {id: 'tailwind-light', label: 'Tailwind Light', light: 'tailwind-light'},
        ],
    },
];

/** Flat list of every selectable theme (derived from `THEME_GROUPS`). */
export const THEME_OPTIONS: IPrimeThemeOption[] = THEME_GROUPS.flatMap(group => group.items);

/**
 * Option the Theme resolves to when a configured/default folder is not present
 * in the registry. Every legacy folder is registered, so this is a safety net.
 */
export const FALLBACK_THEME_OPTION: IPrimeThemeOption =
    THEME_OPTIONS.find(option => option.id === 'vela-blue') ?? THEME_OPTIONS[0];

const OPTION_BY_ID = new Map(THEME_OPTIONS.map(option => [option.id, option]));

/**
 * `?inline` imports of every PrimeReact theme. Explicit entries (rather than
 * `import.meta.glob`) keep Vite's bundling deterministic — globbing files under
 * `node_modules` is not reliable across package managers.
 */
export const THEME_LOADERS: Record<string, () => Promise<{default: string}>> = {
    'arya-blue': () => import('primereact/resources/themes/arya-blue/theme.css?inline'),
    'arya-green': () => import('primereact/resources/themes/arya-green/theme.css?inline'),
    'arya-orange': () => import('primereact/resources/themes/arya-orange/theme.css?inline'),
    'arya-purple': () => import('primereact/resources/themes/arya-purple/theme.css?inline'),
    'bootstrap4-dark-blue': () => import('primereact/resources/themes/bootstrap4-dark-blue/theme.css?inline'),
    'bootstrap4-dark-purple': () => import('primereact/resources/themes/bootstrap4-dark-purple/theme.css?inline'),
    'bootstrap4-light-blue': () => import('primereact/resources/themes/bootstrap4-light-blue/theme.css?inline'),
    'bootstrap4-light-purple': () => import('primereact/resources/themes/bootstrap4-light-purple/theme.css?inline'),
    'fluent-light': () => import('primereact/resources/themes/fluent-light/theme.css?inline'),
    'lara-dark-amber': () => import('primereact/resources/themes/lara-dark-amber/theme.css?inline'),
    'lara-dark-blue': () => import('primereact/resources/themes/lara-dark-blue/theme.css?inline'),
    'lara-dark-cyan': () => import('primereact/resources/themes/lara-dark-cyan/theme.css?inline'),
    'lara-dark-green': () => import('primereact/resources/themes/lara-dark-green/theme.css?inline'),
    'lara-dark-indigo': () => import('primereact/resources/themes/lara-dark-indigo/theme.css?inline'),
    'lara-dark-pink': () => import('primereact/resources/themes/lara-dark-pink/theme.css?inline'),
    'lara-dark-purple': () => import('primereact/resources/themes/lara-dark-purple/theme.css?inline'),
    'lara-dark-teal': () => import('primereact/resources/themes/lara-dark-teal/theme.css?inline'),
    'lara-light-amber': () => import('primereact/resources/themes/lara-light-amber/theme.css?inline'),
    'lara-light-blue': () => import('primereact/resources/themes/lara-light-blue/theme.css?inline'),
    'lara-light-cyan': () => import('primereact/resources/themes/lara-light-cyan/theme.css?inline'),
    'lara-light-green': () => import('primereact/resources/themes/lara-light-green/theme.css?inline'),
    'lara-light-indigo': () => import('primereact/resources/themes/lara-light-indigo/theme.css?inline'),
    'lara-light-pink': () => import('primereact/resources/themes/lara-light-pink/theme.css?inline'),
    'lara-light-purple': () => import('primereact/resources/themes/lara-light-purple/theme.css?inline'),
    'lara-light-teal': () => import('primereact/resources/themes/lara-light-teal/theme.css?inline'),
    'luna-amber': () => import('primereact/resources/themes/luna-amber/theme.css?inline'),
    'luna-blue': () => import('primereact/resources/themes/luna-blue/theme.css?inline'),
    'luna-green': () => import('primereact/resources/themes/luna-green/theme.css?inline'),
    'luna-pink': () => import('primereact/resources/themes/luna-pink/theme.css?inline'),
    'md-dark-deeppurple': () => import('primereact/resources/themes/md-dark-deeppurple/theme.css?inline'),
    'md-dark-indigo': () => import('primereact/resources/themes/md-dark-indigo/theme.css?inline'),
    'md-light-deeppurple': () => import('primereact/resources/themes/md-light-deeppurple/theme.css?inline'),
    'md-light-indigo': () => import('primereact/resources/themes/md-light-indigo/theme.css?inline'),
    'mdc-dark-deeppurple': () => import('primereact/resources/themes/mdc-dark-deeppurple/theme.css?inline'),
    'mdc-dark-indigo': () => import('primereact/resources/themes/mdc-dark-indigo/theme.css?inline'),
    'mdc-light-deeppurple': () => import('primereact/resources/themes/mdc-light-deeppurple/theme.css?inline'),
    'mdc-light-indigo': () => import('primereact/resources/themes/mdc-light-indigo/theme.css?inline'),
    'mira': () => import('primereact/resources/themes/mira/theme.css?inline'),
    'nano': () => import('primereact/resources/themes/nano/theme.css?inline'),
    'nova': () => import('primereact/resources/themes/nova/theme.css?inline'),
    'nova-accent': () => import('primereact/resources/themes/nova-accent/theme.css?inline'),
    'nova-alt': () => import('primereact/resources/themes/nova-alt/theme.css?inline'),
    'rhea': () => import('primereact/resources/themes/rhea/theme.css?inline'),
    'saga-blue': () => import('primereact/resources/themes/saga-blue/theme.css?inline'),
    'saga-green': () => import('primereact/resources/themes/saga-green/theme.css?inline'),
    'saga-orange': () => import('primereact/resources/themes/saga-orange/theme.css?inline'),
    'saga-purple': () => import('primereact/resources/themes/saga-purple/theme.css?inline'),
    'soho-dark': () => import('primereact/resources/themes/soho-dark/theme.css?inline'),
    'soho-light': () => import('primereact/resources/themes/soho-light/theme.css?inline'),
    'tailwind-light': () => import('primereact/resources/themes/tailwind-light/theme.css?inline'),
    'vela-blue': () => import('primereact/resources/themes/vela-blue/theme.css?inline'),
    'vela-green': () => import('primereact/resources/themes/vela-green/theme.css?inline'),
    'vela-orange': () => import('primereact/resources/themes/vela-orange/theme.css?inline'),
    'vela-purple': () => import('primereact/resources/themes/vela-purple/theme.css?inline'),
    'viva-dark': () => import('primereact/resources/themes/viva-dark/theme.css?inline'),
    'viva-light': () => import('primereact/resources/themes/viva-light/theme.css?inline'),
};

/** Look up a theme option by its stable id. */
export function themeOptionById(id: string): IPrimeThemeOption | undefined {
    return OPTION_BY_ID.get(id);
}

/** Find the option that owns a given PrimeReact theme folder. */
export function themeOptionByFolder(folder: string): IPrimeThemeOption | undefined {
    return THEME_OPTIONS.find(option => option.light === folder || option.dark === folder);
}

/** The palette a PrimeReact theme folder represents, or `undefined` if unknown. */
export function paletteOfFolder(folder: string): ThemePalette | undefined {
    const option = themeOptionByFolder(folder);
    if (!option) return undefined;
    return option.light === folder ? 'light' : 'dark';
}

/** Resolve the PrimeReact folder to load for an option at a given palette. */
export function resolveThemeFolder(option: IPrimeThemeOption, palette: ThemePalette): string {
    const folder = palette === 'dark' ? option.dark : option.light;
    return folder ?? option.light ?? option.dark ?? '';
}

/**
 * Resolve a `IThemeConfig.name` string — which may be a theme-option id
 * (`lara-blue`, `glass`) or a PrimeReact folder name (`lara-dark-blue`) — to an
 * option plus its palette.
 */
export function themeOptionByName(
    name: string,
): {option: IPrimeThemeOption; palette: ThemePalette} | undefined {
    const byId = themeOptionById(name);
    if (byId) {
        if (byId.variant) return {option: byId, palette: 'dark'};
        return {option: byId, palette: byId.dark ? 'dark' : 'light'};
    }
    const byFolder = themeOptionByFolder(name);
    if (byFolder) {
        return {option: byFolder, palette: paletteOfFolder(name) ?? 'light'};
    }
    return undefined;
}

/** Load the CSS text for a PrimeReact theme folder (empty string if unknown). */
export async function loadThemeCss(folder: string): Promise<string> {
    const loader = THEME_LOADERS[folder];
    if (!loader) return '';
    const module = await loader();
    return module.default;
}
/* spell-checker: enable */
