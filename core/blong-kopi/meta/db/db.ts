import {handler} from '@feasibleone/blong';

/**
 * meta/db/db.ts — `$subject` schema/seed configuration.
 *
 * Declares the two tables (`$subject.$object`, `$subject.line`) and enables
 * test seed processing (`dbTest: true`) so `meta/dbTest/*.yaml` loads in the
 * dev/integration intents. No `mock` entries — the model uses the real DB
 * tables via the auto-bound CRUD handlers, which is what the tap and Playwright
 * tests exercise.
 *
 * `mock` is the server-side twin of the Storybook fixture: `mock: true` mocks
 * every model, and `mock: {<modelHandlerName>: true}` (a RegExp value matches
 * by name) makes the shared `srv.db` adapter serve those models from
 * `${subject}Fixture` data instead of the database. `demo/blong-marine` uses it
 * deliberately — coral is served by the database while family/species/habitat
 * are mocked — so both paths stay covered by one suite. The template omits it so
 * a scaffolded realm starts against real tables.
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
