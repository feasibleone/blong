import {handler} from '@feasibleone/blong';

/**
 * `portalConfigGet` — the review page's menu group (`@@T-473`).
 *
 * A realm contributes pages by answering `portalConfigGet`: `portalConfigMerge`
 * asks every provider and composes the answers, so this group reaches the menubar
 * beside the groups the model system generates, without the suite naming it in its
 * own configuration. The name is the hook the shell looks for, which is why this
 * one handler is not a semantic triple — the same reason the model aggregator's
 * entry carries it.
 *
 * The group's id is `feedback`, which is what makes
 * `portal.menuClick('feedback-review')` reach the page. The page itself is gated by
 * `feedback.session.find`, so a person who may not review sees no tab even when
 * the item is merged into their menu.
 */
export default handler(() => ({
    async portalConfigGet() {
        return {
            menu: [
                {
                    id: 'feedback',
                    title: 'Feedback',
                    items: [
                        {
                            title: 'Review',
                            method: 'feedback.review',
                            icon: 'pi pi-comment',
                        },
                    ],
                },
            ],
        };
    },
}));
