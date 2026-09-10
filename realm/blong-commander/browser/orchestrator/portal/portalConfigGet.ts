import {handler} from '@feasibleone/blong';

/**
 * `portalConfigGet` — portal config fallback for the model-less commander
 * browser. App.tsx calls `handler.portalConfigGet({}, {})` unconditionally
 * after login; a model aggregator normally provides it (merging model menus
 * with the `ui.portal.portal` config slice), but commander has no models.
 *
 * This group (`commander.portal`) is imported by the portal orchestrator via
 * the `/.portal$/` pattern — the same mechanism that exposes `ui.portal`
 * methods (e.g. `portalDropdownList`) as bare handler names — so
 * `handler.portalConfigGet` resolves here.
 *
 * NOTE: the `ui.portal.portal` config slice does NOT reach this group's
 * handler `config` (config plumbing only applies to the portal orchestrator
 * itself), so the commander menu is provided as a guaranteed default here.
 */
export default handler(
    ({config}) =>
        async function portalConfigGet(): Promise<Record<string, unknown>> {
            const portal = (config as {portal?: {title?: string; menu?: unknown[]}}).portal ?? {};
            return {
                name: 'blong-commander',
                title: 'Blong Commander',
                ...portal,
                menu: portal.menu ?? [
                    {
                        title: 'Explore',
                        items: [
                            {
                                title: 'Commander',
                                method: 'commander.browse',
                                icon: 'pi pi-sitemap',
                            },
                        ],
                    },
                ],
            };
        },
);
