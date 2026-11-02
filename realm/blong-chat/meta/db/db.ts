import {handler} from '@feasibleone/blong';

/**
 * `meta/db/db.ts` — the `chat` schema configuration.
 *
 * One table, ordered above the framework's (`core.*` is order 1) and below the realms that keep a
 * run: nothing references a channel, so the order is only about creating it after the registry that
 * all realms share.
 *
 * `dbTest` is deliberately not pinned here, for the reason `realm/blong-agent` records (`@@F-613`):
 * whether the test seeds dispatch is the shared `srv.db` adapter's decision.
 */
export default handler(() => ({
    config: {
        schema: {
            tables: {
                'chat.channel': 100,
            },
        },
    },
}));
