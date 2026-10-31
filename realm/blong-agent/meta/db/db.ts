import {handler} from '@feasibleone/blong';

/**
 * `meta/db/db.ts` — `agent` schema configuration.
 *
 * The four tables are ordered above every framework table (`core.*` is order 1, party's are 300+),
 * because `agent.checkpoint`, `agent.answer` and `agent.event` carry foreign keys into
 * `agent.session` and the referenced table has to exist first.
 *
 * `dbTest` is deliberately not pinned here: whether `meta/dbTest/*.yaml` is dispatched is the shared
 * `srv.db` adapter's decision, and a realm that pins it re-enables the test seeds in every intent,
 * `upgrade` included (`@@F-613`). There is no fixture folder either: the realm's stand-in for the
 * ticket pool is the task adapter, not a model (`@@D-707`).
 */
export default handler(() => ({
    config: {
        schema: {
            tables: {
                'agent.session': 500,
                'agent.checkpoint': 501,
                'agent.answer': 502,
                'agent.event': 503,
            },
        },
    },
}));
