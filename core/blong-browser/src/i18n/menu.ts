import type {IMenuItem, IPortalConfig} from '../types/portal.js';

/** The component method that opens the untranslated-strings page. */
export const TRANSLATION_REPORT_METHOD = 'ui.i18n.missing';

/**
 * Add the untranslated-strings page to a portal that collects.
 *
 * The entry exists only while `translation.collect` is on, so a normal portal
 * — and every screenshot baseline taken from one — never grows a menu group it
 * cannot explain (`D-634`). Idempotent: composing the config twice must not list
 * the page twice.
 */
export function withTranslationReport(config: IPortalConfig): IPortalConfig {
    if (!config.translation?.collect) return config;
    const menu = (config.menu ?? []) as IMenuItem[];
    const present = menu.some(
        entry =>
            typeof entry !== 'string' &&
            'items' in entry &&
            (entry.items as unknown[]).some(
                item =>
                    typeof item === 'string' ||
                    (item as {method?: string}).method === TRANSLATION_REPORT_METHOD,
            ),
    );
    if (present) return config;
    return {
        ...config,
        menu: [
            ...menu,
            {
                id: 'i18n',
                title: 'Translations',
                items: [{method: TRANSLATION_REPORT_METHOD} as IMenuItem],
            },
        ],
    };
}
