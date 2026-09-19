/**
 * portalConfig.ts — how several realms' portal configurations become one.
 *
 * Every realm that owns pages answers `portalConfigGet`, and in a suite more than
 * one does: the model aggregator on behalf of each model-owning realm, and a realm
 * that writes its pages by hand. A port resolves a method name to a single
 * function — the newest group shadows the earlier ones, deliberately, so a handler
 * can call its super — so without this file the last realm loaded decided the whole
 * menu and every other realm's pages disappeared from it.
 *
 * The rule is stated once, here, and is pure: menus concatenate in provider order
 * (provider order is the suite's `children` order), groups of equal title merge and
 * leaves dedupe by the method they open, and the first provider that sets a scalar
 * — name, title, theme, home, profile, languages, translations — wins. A suite's own
 * `ui.portal.portal.title` therefore keeps the title it configured, while every
 * realm still contributes its pages.
 *
 * Deduplication is not a nicety: every model provider on the port reads the same
 * accumulated `config.context.menus` map, so each of them answers with the same
 * union menu, and plain concatenation would list every model page once per model
 * group.
 */
import type {IMenuItem, IPortalConfig} from './types/portal.js';

/** A menu entry as realms actually emit them: an action, a group, or a bare method. */
type MenuEntry = IMenuItem | string;

/** Identity of a menu entry for deduplication: a group by title, a leaf by method. */
function entryKey(entry: MenuEntry): string {
    if (typeof entry === 'string') return `leaf:${entry}`;
    if ('items' in entry) return `group:${entry.title}`;
    const leaf = entry as {method?: string; title?: string};
    return `leaf:${leaf.method ?? leaf.title ?? ''}`;
}

/** Append `incoming` to `target`, merging same-titled groups and skipping what is already there. */
function mergeEntries(target: MenuEntry[], incoming: readonly MenuEntry[]): void {
    for (const entry of incoming) {
        const key = entryKey(entry);
        const existing = target.find(candidate => entryKey(candidate) === key);
        if (existing === undefined) {
            target.push(entry);
        } else if (
            typeof existing === 'object' &&
            'items' in existing &&
            typeof entry === 'object' &&
            'items' in entry
        ) {
            mergeEntries(existing.items as MenuEntry[], entry.items as readonly MenuEntry[]);
        }
        // A leaf already present keeps the first provider's wording: it opens the
        // same page either way, and the first provider is the one the suite
        // configured.
    }
}

/** The first provider that sets a value, ignoring empty strings and empty arrays. */
function firstSet<K extends keyof IPortalConfig>(
    providers: readonly Partial<IPortalConfig>[],
    key: K,
): IPortalConfig[K] | undefined {
    for (const provider of providers) {
        const value = provider[key];
        if (value === undefined || value === null) continue;
        if (typeof value === 'string' && value === '') continue;
        if (Array.isArray(value) && value.length === 0) continue;
        return value;
    }
    return undefined;
}

/**
 * Compose the portal configuration any number of realms provide into the one the
 * shell renders. Missing or empty answers are skipped, so a realm that ships no
 * pages contributes nothing rather than blanking the portal.
 */
export function mergePortalConfigs(
    configs: readonly (Partial<IPortalConfig> | undefined | null)[],
): IPortalConfig {
    const providers = configs.filter(
        (config): config is Partial<IPortalConfig> => config !== undefined && config !== null,
    );
    const config: IPortalConfig = {
        name: firstSet(providers, 'name') ?? 'blong-portal',
        title: firstSet(providers, 'title') ?? 'Blong',
    };
    const theme = firstSet(providers, 'theme');
    if (theme !== undefined) config.theme = theme;
    const home = firstSet(providers, 'home');
    if (home !== undefined) config.home = home;
    const profile = firstSet(providers, 'profile');
    if (profile !== undefined) config.profile = profile;
    const languages = firstSet(providers, 'languages');
    if (languages !== undefined) config.languages = languages;
    const translations = firstSet(providers, 'translations');
    if (translations !== undefined) config.translations = translations;

    const menu: MenuEntry[] = [];
    const rightMenu: MenuEntry[] = [];
    for (const provider of providers) {
        if (provider.menu) mergeEntries(menu, provider.menu as readonly MenuEntry[]);
        if (provider.rightMenu) mergeEntries(rightMenu, provider.rightMenu as readonly MenuEntry[]);
    }
    if (menu.length) config.menu = menu as IMenuItem[];
    if (rightMenu.length) config.rightMenu = rightMenu as IMenuItem[];
    return config;
}
