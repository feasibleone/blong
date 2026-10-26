import {handler} from '@feasibleone/blong';

/**
 * `ui.i18n.missing` — the untranslated-strings page.
 *
 * Registered as a component page and opened from the menu entry that
 * `withTranslationReport` adds while `translation.collect` is on (`D-634`). The
 * JSX lives in `src/pages/` so the Node tap runner never resolves a `.tsx`; only
 * Vite bundles it.
 */
export default handler(function uiI18nMissing() {
    return {
        'ui.i18n.missing': async () => ({
            title: 'Untranslated strings',
            component: async () => {
                const {I18nMissingPage} = await import('../../src/pages/i18nMissingPage.js');
                return I18nMissingPage;
            },
        }),
    };
});
