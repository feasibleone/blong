import {handler} from '@feasibleone/blong';

/**
 * `commander.browse` — custom browser page mounting the Commander
 * universal backend explorer.
 *
 * The portal menu (`ui.portal.portal.menu` → `commander.browse`) resolves this
 * page via `component/commander.browse`. The portal config fallback
 * (`portalConfigGet`) is provided by the `commander.portal` group so a
 * model-less standalone commander browser still gets a menu (App.tsx calls
 * `portalConfigGet` unconditionally after login).
 *
 * The page JSX lives in `src/pages/` (outside the well-known browser layer
 * folders) and is loaded lazily — the Node tap runner loads this handler
 * without ever resolving the `.tsx` (which only Vite can bundle).
 */
export default handler(function commanderBrowse() {
    return {
        'commander.browse': async () => ({
            title: 'Commander',
            icon: 'pi pi-sitemap',
            component: async () => {
                const {CommanderBrowsePage} = await import(
                    '../../../src/pages/commanderBrowsePage.js'
                );
                return CommanderBrowsePage;
            },
        }),
    };
});
