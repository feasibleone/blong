import {handler} from '@feasibleone/blong';

/**
 * meta/db/db.ts — `feedback` schema configuration (`@@T-455`).
 *
 * The three tables are registered above every framework table (`core.*` is
 * order 1, party's are 300+), because `feedback.session` carries foreign keys
 * into `core.resource` and the referenced tables must exist first.
 *
 * `dbTest` is on so `meta/dbTest` seeds an empty-ish database with sessions that
 * the review page can show during development and in the Storybook story. The
 * fixture folder is deliberately absent: the feedback surfaces read the real
 * tables, and a Storybook story points at a running backend instead of a mock.
 */
export default handler(() => ({
    config: {
        schema: {
            tables: {
                'feedback.session': 400,
                'feedback.item': 401,
                'feedback.shot': 402,
            },
        },
    },
}));
