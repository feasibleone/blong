import {handler} from '@feasibleone/blong';

/**
 * `feedback.review` — the admin review page (`@@T-473`).
 *
 * The `component` group of the browser orchestrator is what prefixes the name, so
 * a menu entry naming `feedback.review` resolves to `component/feedback.review`.
 * The page is always discovered; the menu links it (`@@T-473`) through this realm's
 * `portalConfigGet`, and `permission` is what keeps it off a normal user's menu and
 * what the portal checks before it renders the tab.
 */
export default handler(() => ({
    async 'feedback.review'() {
        return {
            title: 'Feedback review',
            permission: 'feedback.session.find',
            icon: 'pi pi-comment',
            component: async () => {
                const {FeedbackReviewPage} = await import(
                    '../../../src/pages/feedbackReviewPage.js'
                );
                return FeedbackReviewPage;
            },
        };
    },
}));
