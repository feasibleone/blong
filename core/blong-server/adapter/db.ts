import {adapter} from '@feasibleone/blong';

/**
 * Non-prod-only resilience for the shared `srv.db` knex adapter, merged only
 * into the `ci` and `dev` config blocks. Production config blocks (`default`,
 * `prod`, `microservice`, `upgrade`, ...) never include it, so production
 * behaviour is unchanged:
 *  - `pool.maxConnectionLifetimeMillis` — tarn recycles long-lived connections;
 *  - `retry` — re-runs queries that hit a transient connection error
 *    (`PROTOCOL_CONNECTION_LOST` etc.) with linear backoff. Connection keep-alive
 *    (`connection.enableKeepAlive`) is set inline per block next to `database`.
 */
const knexResilience = {
    pool: {
        maxConnectionLifetimeMillis: 60000,
    },
    retry: {
        enabled: true,
        maxRetries: 3,
        backoffMs: 250,
    },
} as const;

export default adapter<{
    knex: {
        createDatabase?: boolean;
        connection: {
            database?: string;
            user?: string;
            password?: string;
            enableKeepAlive?: boolean;
        };
        pool?: {
            maxConnectionLifetimeMillis?: number;
        };
        retry?: {
            enabled?: boolean;
            maxRetries?: number;
            backoffMs?: number;
        };
    };
}>(() => ({
    extends: 'adapter.knex',
    activation: {
        default: {
            mock: {},
            knex: {
                connection: {
                    database: '${suite.replaceAll("$", "")}',
                    user: 'blong-admin',
                    password: 'password',
                },
            },
            namespace: 'db',
            imports: [/\.db$/],
        },
        ci: {
            knex: {
                connection: {
                    database: '${suite.replaceAll("$", "")}',
                    enableKeepAlive: true,
                },
                ...knexResilience,
            },
        },
        dev: {
            imports: [/\.db$/, /\.dbTest$/, /\.model$/, /\.fixture$/],
            knex: {
                createDatabase: true,
                connection: {
                    database:
                        '${[suite, user].map(s => s.toLowerCase().replaceAll("$", "").replace(/[^a-z0-9-]/g, "_")).join("-")}',
                    enableKeepAlive: true,
                },
            },
            schema: {
                sync: true,
                seed: true,
                dbTest: true,
                dropColumns: true,
            },
        },
        upgrade: {
            schema: {
                sync: true,
                seed: true,
            },
        },
        microservice: {
            imports: [/\.db$/, /\.model$/, /\.fixture$/],
        },
    },
}));
