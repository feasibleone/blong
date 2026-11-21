import {handler} from '@feasibleone/blong';

/**
 * `portalConfigGet` — the viewer's menu group (`@@D-946`).
 *
 * A realm contributes pages by answering `portalConfigGet`: `portalConfigMerge`
 * asks every provider and composes the answers, so this group reaches the menu
 * bar beside the groups the model system generates without the suite naming it
 * in its own configuration. The name is the hook the shell looks for, which is
 * why this one handler is not a semantic triple.
 *
 * The menu is a place to look for the page, not a grant: the page is gated by
 * `viewer.entry.find`, so a person without it sees no tab even where the entry
 * is merged in.
 */
export default handler(() => ({
    async portalConfigGet() {
        return {
            menu: [
                {
                    id: 'viewer',
                    title: 'Observability',
                    items: [
                        {
                            title: 'Logs',
                            method: 'viewer.log',
                            icon: 'pi pi-list',
                        },
                    ],
                },
            ],
        };
    },
}));
