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

export interface ISchemaTable {
    /**
     * The TypeBox `TObject` for the table.  Optional when the definition is
     * available from the realm's `schema` (resolved via `objectSchema[subject][object]`),
     * in which case the spec only overrides `order` / `dropdown`.
     */
    definition?: TObject;
    order?: number;
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

export interface IConfig {
    knex: object;
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
    };
    /**
     * When `true`, mocks some handlers
     */
    mock?: boolean | Record<string, boolean | RegExp>;
}
