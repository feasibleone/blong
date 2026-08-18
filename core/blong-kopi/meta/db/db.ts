import {handler} from '@feasibleone/blong';

/**
 * meta/db/db.ts — `$subject` schema/seed configuration.
 *
 * Declares the two tables (`$subject.$object`, `$subject.line`) and enables
 * test seed processing (`dbTest: true`) so `meta/dbTest/*.yaml` loads in the
 * dev/integration intents. No `mock` entries — the model uses the real DB
 * tables via the auto-bound CRUD handlers.
 */
export default handler(() => ({
    config: {
        schema: {
            dbTest: true,
            tables: {
                '$subject.$object': 1,
                '$subject.line': 2,
            },
        },
    },
}));
