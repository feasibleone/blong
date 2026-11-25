import {handler} from '@feasibleone/blong';

/**
 * `portalConfigGet` — the agent realm's menu group (`@@T-796`).
 *
 * A realm contributes pages by answering `portalConfigGet`: `portalConfigMerge` asks every provider
 * and composes the answers, so this group reaches the menu bar beside the groups the model system
 * generates without the suite naming it in its own configuration. The name is the hook the shell
 * looks for, which is why this one handler is not a semantic triple.
 *
 * The menu is a place to look for the page, not a grant: the page is gated by `agent.session.find`,
 * so a person without it sees no tab even where the entry is merged in.
 */
export default handler(() => ({
    async portalConfigGet() {
        return {
            menu: [
                {
                    id: 'agent',
                    title: 'Agent',
                    items: [
                        {
                            title: 'Sessions',
                            method: 'agent.session',
                            icon: 'pi pi-comments',
                        },
                    ],
                },
            ],
        };
    },
}));
