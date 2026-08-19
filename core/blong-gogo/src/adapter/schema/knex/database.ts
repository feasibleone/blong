/**
 * `ensureDatabase` — create the MySQL database if it does not exist.
 *
 * Used by the knex adapter (`adapter/server/knex.ts`) before building the real
 * pool when `knex.createDatabase` is enabled (default on in the `dev` intent via
 * the shared `srv.db` adapter). Connects WITHOUT a database, checks
 * `information_schema.schemata`, and issues `CREATE DATABASE` when the schema is
 * missing. On failure the caller decides whether to warn-and-continue (schema
 * sync will surface the real error) or fail.
 */

import {createConnection} from 'mysql2/promise';

export interface IEnsureDatabaseOptions {
    host?: string;
    port?: number;
    user?: string;
    password?: string;
    database?: string;
}

export interface IEnsureDatabaseResult {
    /** Whether the database had to be created (false when it already existed). */
    created: boolean;
    /** The database name that was checked / created. */
    database: string;
}

/** The minimal admin-connection surface used by `ensureDatabase`. */
export interface IAdminConnection {
    query<T>(sql: string, params?: unknown[]): Promise<[T, unknown]>;
    end(): Promise<void>;
}

type IConnect = (config: Record<string, unknown>) => Promise<IAdminConnection>;

/**
 * Try to create `database` if it does not exist. Resolves `{created, database}`
 * on success; rejects if the server cannot be reached or `CREATE DATABASE`
 * fails. `connect` is injectable for tests (defaults to `mysql2`).
 */
export async function ensureDatabase(
    options: IEnsureDatabaseOptions,
    connect: IConnect = createConnection as unknown as IConnect,
): Promise<IEnsureDatabaseResult> {
    const database = options.database;
    if (!database) return {created: false, database: ''};
    const admin = await connect({
        host: options.host ?? 'localhost',
        port: options.port ?? 3306,
        user: options.user,
        password: options.password,
    });
    try {
        const [rows] = await admin.query<Array<{SCHEMA_NAME: string}>>(
            'SELECT SCHEMA_NAME FROM information_schema.schemata WHERE SCHEMA_NAME = ?',
            [database],
        );
        if (rows.length > 0) return {created: false, database};
        await admin.query(
            `CREATE DATABASE \`${database.replaceAll('`', '``')}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
        );
        return {created: true, database};
    } finally {
        await admin.end();
    }
}
