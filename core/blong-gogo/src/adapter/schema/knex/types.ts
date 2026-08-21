import {type Knex} from '@feasibleone/blong/types';
import {type TObject} from 'typebox';

export interface ITableConstraints {
    /** Composite primary key (single-column PKs are handled by the column definition itself). */
    primaryKey?: {
        columns: string[];
        constraintName?: string;
    };
    /** Unique constraints keyed by constraint name. */
    unique?: Record<
        string,
        {
            /** Column name(s). When omitted for single-column constraints, defaults to `[key]`. */
            columns?: string[];
        }
    >;
    /** Indexes keyed by index name. */
    index?: Record<
        string,
        {
            /** Column name(s). When omitted for single-column indexes, defaults to `[key]`. */
            columns?: string[];
            /** Optional index type (e.g. `'btree'`, `'hash'`). */
            indexType?: string;
        }
    >;
    /** Foreign key constraints keyed by constraint name. */
    foreign?: Record<
        string,
        | string
        | {
              /** Column name(s). When omitted for single-column constraints, defaults to `[key]`. */
              columns?: string[];
              /** Table and column this FK references, e.g. `"core.type.typeId"` */
              references: string;
              onDelete?: string;
              onUpdate?: string;
          }
    >;
}

export interface IEdgeBinding {
    /**
     * The `core_triple` predicate of the edge, e.g. `hasRole`.
     */
    predicate: string;
    /**
     * The entity table holding the edge's object rows (e.g. `access_role`).
     * The edges themselves live in `core_triple` (`subjectId -predicate->
     * objectId`), keyed by the resource id.
     */
    table: string;
    /**
     * The detail object name — the sibling array key returned on `get` and
     * accepted on `add`/`edit` (defaults to the predicate's object segment,
     * e.g. `role` for `hasRole`).
     */
    object?: string;
    /**
     * The object table's PK column (defaults to `${object}Id`).
     */
    objectKey?: string;
    /**
     * The object display-name field joined from `core_resource.resourceName`
     * (defaults to `${object}Name`).
     */
    nameField?: string;
    /**
     * When true, only rows with `granted !== false` are kept when syncing
     * edges on `add`/`edit` (the model pivot submits a `granted` boolean).
     */
    granted?: boolean;
    /**
     * When true, `remove` also deletes the reverse edges (`objectId` of this
     * subject) pointing at this subject from other entities.
     */
    reverse?: boolean;
}

export interface ISchemaTable {
    /**
     * The TypeBox `TObject` for the table.  Optional when the definition is
     * available from the realm's `schema` (resolved via `objectSchema[subject][object]`),
     * in which case the spec only overrides `order` / `dropdown`.
     */
    definition?: TObject;
    order?: number;
    /**
     * Marks the table as resource-backed: its PK is a FK to
     * `core.resource.resourceId` and its display name lives in
     * `core_resource.resourceName`.  When true the generic CRUD:
     *  - `add` generates a server-side PK + `core_resource` row for a missing
     *    not-null id (and when the PK carries a `uuid`/`ulid` default marker);
     *  - `find`/`get` join `resourceName` as `${object}Name`;
     *  - `edit` renames `core_resource.resourceName` from `${object}Name`;
     *  - `remove` deletes the `core_resource` row (and the declared `edges`).
     */
    resource?: boolean;
    /**
     * Declarative graph-edge master-detail bindings (`core_triple` edges such
     * as `hasRole` / `hasCapability`). `get` attaches the edge rows as a
     * sibling array; `add`/`edit` diff-sync the edges (plus one
     * `access_pathRefresh`); `remove` cleans them.
     */
    edges?: IEdgeBinding[];
    /**
     * Optional per-table dropdown binding override used by the auto-bound
     * `{subject}.dropdown.list` handler (see the knex adapter `exec()`).
     */
    dropdown?: {
        /** `core_type.typeAlias` to resolve entries from (defaults to `${subject}.${object}`). */
        typeAlias?: string;
        /** Entity table to join on `${joinColumn} = core_resource.resourceId` to restrict to real rows. */
        joinTable?: string;
        /** Join column on `joinTable` (defaults to `${object}Id`). */
        joinColumn?: string;
        /** Column to use as the label (defaults to `resourceName`). */
        labelColumn?: string;
    };
}

export interface IColumnSchema {
    type?: string;
    format?: string;
    maxLength?: number;
    default?: unknown;
    readonly?: boolean;
}

/** Knex connection settings accepted by a DB adapter. */
export interface IKnexConnection {
    host?: string;
    port?: number;
    user?: string;
    password?: string;
    database?: string;
    /**
     * mysql2 TCP keep-alive. When `true`, idle connections send keep-alive
     * probes so a server/proxy/LB silently closing an idle socket is noticed
     * promptly instead of surfacing later as a mid-query
     * `PROTOCOL_CONNECTION_LOST`. Enabled for non-prod via the shared `srv.db`
     * adapter (`core/blong-server/adapter/db.ts`).
     */
    enableKeepAlive?: boolean;
    [key: string]: unknown;
}

/**
 * Opt-in retry of transient fatal connection errors (e.g. mysql2
 * `PROTOCOL_CONNECTION_LOST`). Intended for non-prod environments (CI / dev)
 * where a single dropped connection must not abort a whole test run. Disabled
 * by default so production behaviour is unchanged — enable explicitly via the
 * `knex.retry` config block (see `core/blong-server/adapter/db.ts`).
 */
export interface IKnexRetryOptions {
    /** When `true`, queries that fail with a transient connection error are retried. Default `false`. */
    enabled?: boolean;
    /** Maximum number of retry attempts per query (excluding the first attempt). Default `3`. */
    maxRetries?: number;
    /** Base delay before the first retry (ms); each retry waits `backoffMs * attempt`. Default `250`. */
    backoffMs?: number;
}

/** The `knex` config block of a DB adapter (adapter.knex / the shared `srv.db`). */
export interface IKnexConfig {
    client?: string;
    connection?: IKnexConnection;
    /**
     * When `true`, the adapter tries to `CREATE DATABASE` if it does not exist
     * before connecting. Default on in the `dev` intent via the shared `srv.db`
     * adapter (`core/blong-server/adapter/db.ts`); opt out with `false`. Off in
     * `default` / `ci` / `prod`, where the database is provisioned externally.
     */
    createDatabase?: boolean;
    /**
     * Knex/tarn pool options (passed through to the `knex` pool config, e.g.
     * `maxConnectionLifetimeMillis` to recycle long-lived connections).
     */
    pool?: {
        /** Max lifetime of a pooled connection in ms before it is recycled. */
        maxConnectionLifetimeMillis?: number;
        [key: string]: unknown;
    };
    /** Opt-in retry of transient fatal connection errors — non-prod only. */
    retry?: IKnexRetryOptions;
    [key: string]: unknown;
}

export interface IConfig {
    knex: IKnexConfig;
    context: {
        queryBuilder?: Knex;
    };
    /**
     * The adapter's namespace (e.g. `"sql"`). When set, CRUD handlers are
     * auto-bound for each declared table and named
     * `${namespace}${TableName}${Predicate}` (e.g. `sqlItemAdd`).
     */
    namespace?: string;
    schema?: {
        /** When `true`, tables and procedures are synced on every startup. */
        sync?: boolean;
        /** When `true`, seed data is merged on every startup. */
        seed?: boolean;
        /** When `true`, dbTest seed data (dbTest.asset modules) is merged. */
        dbTest?: boolean;
        dropColumns?: boolean;
        /**
         * Tables to create / alter. Keys are SQL table names, values are either
         * a plain TypeBox `TObject` or an `ISchemaTable` spec.
         */
        tables?: Record<string, ISchemaTable | TObject>;
        /**
         * Inline stored-procedure definitions (name → full `CREATE PROCEDURE` SQL).
         * Kept for backward compatibility; prefer `procedurePaths` for file-based
         * definitions.
         */
        procedures?: Record<string, string>;
        /**
         * Absolute paths to directories that are scanned for `*.sql` files.
         * Each file's base name (without extension) is used as the procedure name.
         * By convention use a sub-folder named `schema`.
         */
        procedurePaths?: string[];
        accessPathRefresh?: boolean; // When `true`, calls `access_pathRefresh()` after schema sync/seed (default: `false`).
    };
    /**
     * When `true`, mocks some handlers
     */
    mock?: boolean | Record<string, boolean | RegExp>;
}
