import {handler} from '@feasibleone/blong';

/**
 * `portalConfigGet` — the realm's portal config: its title and its menu.
 *
 * `App.tsx` calls `handler.portalConfigGet({}, {})` immediately after login, and a
 * realm with model specs gets it from the model aggregator. This realm writes its
 * pages by hand instead, so it answers for itself — the way `blong-commander`
 * does, through a group the portal orchestrator imports by the `portal` folder.
 * The alternative is what this realm did first: no answer at all, which the
 * browser reports as `Handler 'portalConfigGet' not found` and the menu never
 * renders, so every page looks unreachable while the realm is perfectly healthy.
 *
 * The entries carry the ids the pages registered under
 * (`component/blong.<object>.component.ts`), so a renamed page is a menu entry
 * that opens nothing — visible at once, rather than silently absent.
 *
 * NOTE: the `ui.portal.portal` config slice does not reach this handler's config
 * (config plumbing applies to the portal orchestrator itself), so the menu is a
 * default here rather than something a suite configures.
 *
 * It sets no `title`: a realm that ships pages is loaded into *other* realms'
 * suites (this one into blong-gateway's), and the composed portal takes each
 * scalar from the first provider that sets it — so a brand written here becomes
 * the title of whatever application hosts this realm. The title belongs to the
 * suite, which configures it under `ui.portal.portal.title` ("Blong $Subject" in
 * this realm's own suite).
 */
export default handler(
    ({config}) =>
        async function portalConfigGet(): Promise<Record<string, unknown>> {
            const portal = (config as {portal?: {title?: string; menu?: unknown[]}}).portal ?? {};
            return {
                name: 'blong-realm',
                ...portal,
                menu: portal.menu ?? [
                    {
                        title: 'Observe',
                        items: [
                            {title: 'Flows', method: 'blong.flow.browse', icon: 'pi pi-sitemap'},
                            {
                                title: 'Templates',
                                method: 'blong.template.browse',
                                icon: 'pi pi-clone',
                            },
                            {title: 'Search', method: 'blong.search.browse', icon: 'pi pi-search'},
                            {
                                title: 'Digest',
                                method: 'blong.digest.browse',
                                icon: 'pi pi-chart-line',
                            },
                            {
                                title: 'Incidents',
                                method: 'blong.incident.browse',
                                icon: 'pi pi-exclamation-triangle',
                            },
                        ],
                    },
                ],
            };
        },
);
