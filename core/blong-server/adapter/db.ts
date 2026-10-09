import {adapter} from '@feasibleone/blong';

/**
 * Non-prod-only resilience for the shared `srv.db` knex adapter, merged only
 * into the `ci` and `dev` config blocks. Production config blocks (`default`,
 * `release`, `upgrade`, ...) never include it, so production
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
            /**
             * Where the database is. The object is handed to knex as given, so the host and the port
             * are knex's own options — typed here because a *released* process sets them in this
             * adapter's `release` block, where a deployed suite's database lives by convention at the
             * ExternalName Service the tree generates (`db`, port 3306).
             */
            host?: string;
            port?: number;
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
    schema: {
        sync?: boolean;
        seed?: boolean;
        dbTest?: boolean;
        dropColumns?: boolean;
        /**
         * Record-level (ACL) rules shared by every table declaring an `acl`
         * spec — the ACL table name and the graph predicates / `core.path` path
         * types used to resolve the caller's principals and a record's scopes.
         * Defaults live in `core/blong-gogo/src/adapter/server/acl.ts`.
         */
        acl?: {
            table?: string;
            actionTable?: string;
            rolePathType?: string;
            scopePathType?: string;
            unitPredicate?: string;
            scopePredicate?: string;
        };
    };
    connect?: boolean;
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
        } /**
         * What a *deployed* process loads and where it connects.
         *
         * The imports are the `microservice` set: a released process wires the handlers that need
         * the database and skips the test doubles. The connection is the cluster's: the tree names
         * an ExternalName Service `db` unless the suite's `externalServices` says otherwise, so the
         * host is that Service and a suite or a tenant changes it in its own `release` block or in
         * the `.blong_releaserc` the tree mounts (Q7) — the user, the password and the database stay
         * the `default` block's templated values unless one of them overrides them.
         */,
        release: {
            imports: [/\.db$/, /\.model$/],
            knex: {connection: {host: 'db', port: 3306}},
        }, // A planning run has no use for a database. `k8s` loads a suite, derives its tree, writes it
        // and exits, and the database it would connect to is the deployment's — which in a first
        // deployment or a CI run does not exist yet, so the connection failure arrives *after* the
        // tree is on disk and turns a successful generation into a non-zero exit (T-235).
        //
        // `connect: false` rather than unloading the adapter, and the difference matters: the plan
        // owes the suite a migration Job because the *registry* says the suite has a database
        // (`plan.ts`), so an adapter that never registered would take that step away in silence. The
        // adapter loads, binds its declared handlers and touches nothing; a realm whose generator
        // really does read the database overrides this for the intent rather than working around it.
        k8s: {connect: false},
    },
}));
