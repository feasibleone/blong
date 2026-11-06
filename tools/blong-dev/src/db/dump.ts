/**
 * A database dump written as SQL, without `mysqldump`.
 *
 * `blong-dev db backup` has to work on a developer machine and inside CI, where
 * the MySQL client tools are not installed — the dev stack publishes MySQL's port
 * and nothing else. The dump is therefore produced through `mysql2`, which the
 * CLI already depends on for `blong-dev sql`, and the output is the subset of
 * `mysqldump` a dev database needs to be restored:
 *
 *     SET NAMES utf8mb4;
 *     SET FOREIGN_KEY_CHECKS=0;
 *     DROP TABLE IF EXISTS `t`;  CREATE TABLE ...;  INSERT INTO ...;
 *     SET FOREIGN_KEY_CHECKS=1;
 *
 * What it does not reproduce — and a restore therefore does not either — is the
 * server-side extras: routines, triggers, events, and the `DEFINER` of a view.
 * A dev database carries none of them; a database that does is dumped by hand.
 *
 * Values are rendered with `mysql2`'s own escaper, so a Buffer becomes `X'…'`, a
 * Date an ISO literal and a JSON object its string form, exactly as the driver
 * would send them back.
 */
import {escapeId, escape as escapeValue} from 'mysql2';

/** The part of a connection a dump needs — injectable, so the generator is testable. */
export interface IDumpConnection {
    query<T = unknown>(sql: string, params?: unknown[]): Promise<[T, unknown]>;
}

/** How many rows one `SELECT` asks for; a dev database fits in a handful of these. */
const DEFAULT_BATCH_SIZE = 500;

/** One `SHOW FULL TABLES` row, whichever way the server names its columns. */
function tableName(row: Record<string, unknown>): string | undefined {
    const values = Object.values(row);
    return typeof values[0] === 'string' ? values[0] : undefined;
}

/** `t` → `` `t` `` for the names a dump has to quote. */
export function quote(name: string): string {
    return escapeId(name);
}

/** Render one result row as a `VALUES (…)` tuple. */
export function rowValues(row: Record<string, unknown>): string {
    return `(${Object.values(row)
        .map(value => escapeValue(value as string | number | null | Date | Buffer))
        .join(',')})`;
}

/** `INSERT INTO \`t\` (\`a\`,\`b\`) VALUES (…),(…);` for one batch. */
export function insertStatement(table: string, rows: readonly Record<string, unknown>[]): string {
    const columns = Object.keys(rows[0]);
    return `INSERT INTO ${quote(table)} (${columns.map(column => quote(column)).join(',')}) VALUES\n${rows
        .map(row => rowValues(row))
        .join(',\n')};\n`;
}

/** The statement that recreates one table, without its `AUTO_INCREMENT` high-water mark. */
export function createTableStatement(ddl: string): string {
    // `AUTO_INCREMENT=n` is a property of the rows the source database happens to
    // hold, not of the schema: keeping it makes a restore of a trimmed dev copy
    // hand out ids past the gap for no reason.
    return ddl.replace(/\s+AUTO_INCREMENT=\d+/g, '');
}

/**
 * The SQL dump of `database`.
 *
 * Tables are read in batches so a large dev table does not become one buffer, and
 * every statement is separated by a blank line so a partial dump is still
 * readable beside the failing statement.
 */
export async function dumpDatabase(
    connection: IDumpConnection,
    database: string,
    options: {batchSize?: number; now?: Date; tool?: string} = {},
): Promise<string> {
    const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
    const when = (options.now ?? new Date()).toISOString();
    let serverVersion = '';
    try {
        const [rows] =
            await connection.query<Array<Record<string, unknown>>>('SELECT VERSION() AS v');
        serverVersion = String(Object.values(rows[0] ?? {})[0] ?? '');
    } catch {
        // A version header is a courtesy: a server that refuses the call still dumps.
    }
    const [tableRows] = await connection.query<Array<Record<string, unknown>>>(
        `SHOW FULL TABLES FROM ${quote(database)}`,
    );
    const entries = tableRows
        .map(row => ({
            name: tableName(row) ?? '',
            type: String(row.Table_type ?? Object.values(row)[1] ?? 'BASE TABLE'),
        }))
        .filter(entry => entry.name);

    const parts: string[] = [
        `-- ${options.tool ?? 'blong-dev db backup'}`,
        `-- database: ${database}`,
        `-- dumped:   ${when}`,
        ...(serverVersion ? [`-- server:   ${serverVersion}`] : []),
        '--',
        '-- Restore with:  mysql -h <host> -u <user> -p <database> < this-file.sql',
        '',
        'SET NAMES utf8mb4;',
        'SET FOREIGN_KEY_CHECKS=0;',
        '',
    ];

    for (const entry of entries) {
        if (entry.type === 'VIEW') {
            const [rows] = await connection.query<Array<Record<string, unknown>>>(
                `SHOW CREATE VIEW ${quote(database)}.${quote(entry.name)}`,
            );
            const ddl = String(Object.values(rows[0] ?? {})[1] ?? '');
            if (!ddl) continue;
            parts.push(`DROP VIEW IF EXISTS ${quote(entry.name)};`, `${ddl};`, '');
            continue;
        }
        const [createRows] = await connection.query<Array<Record<string, unknown>>>(
            `SHOW CREATE TABLE ${quote(database)}.${quote(entry.name)}`,
        );
        const ddl = String(Object.values(createRows[0] ?? {})[1] ?? '');
        if (!ddl) continue;
        parts.push(
            `DROP TABLE IF EXISTS ${quote(entry.name)};`,
            `${createTableStatement(ddl)};`,
            '',
        );
        let offset = 0;
        for (;;) {
            const [rows] = await connection.query<Array<Record<string, unknown>>>(
                `SELECT * FROM ${quote(database)}.${quote(entry.name)} LIMIT ? OFFSET ?`,
                [batchSize, offset],
            );
            if (!rows.length) break;
            parts.push(insertStatement(entry.name, rows));
            if (rows.length < batchSize) break;
            offset += rows.length;
        }
    }

    parts.push('SET FOREIGN_KEY_CHECKS=1;', '');
    return parts.join('\n');
}
