import {type Knex} from '@feasibleone/blong/types';
import {type TObject} from 'typebox';

export interface ISchemaTable {
    definition: TObject;
    order?: number;
    dropColumns?: boolean;
}

export interface IColumnSchema {
    type?: string;
    format?: string;
    maxLength?: number;
    default?: unknown;
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
}
