/**
 * `blong-dev db` — database housekeeping for the local dev stack.
 *
 * `backup` is the reason this command exists: the dev cluster runs databases
 * nobody can recreate (a hand-edited `blong-sport`, a database seeded by an
 * upgrade run), and a schema change or a re-run of the seeds is exactly when one
 * of them is worth keeping. The dump is taken over the same connection
 * `blong-dev sql` uses — no `mysqldump` binary, no `kubectl exec` into a pod — and
 * lands as one `.zip` in a predefined folder on the host, so it survives the
 * cluster, the pod and the volume it was read from.
 *
 * Where the archive goes, first match wins:
 *
 *   1. `--output <dir>`
 *   2. `$BLONG_BACKUP_DIR`
 *   3. `backup.path` in `.blong_devrc`
 *   4. `dev/backup` beside `rush.json` (a git-ignored host folder)
 *
 * A predefined folder matters because a backup is only useful if the next person
 * — or the next session — finds it without being told. `dev/` is the repository's
 * scratch area, and mounting it into a k3d node (`--volume
 * $PWD/dev/backup:/var/lib/rancher/k3s/storage/backup`) is what turns the same
 * folder into a local-path volume a pod can read.
 *
 * Usage:
 *   blong-dev db backup --database blong-sport
 *   blong-dev db backup --all                     # every non-system database
 *   blong-dev db backup --database blong-sport --output /mnt/backups
 *   blong-dev db list
 */

import {createConnection} from 'mysql2/promise';
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {dumpDatabase} from '../db/dump.ts';
import {createZip} from '../db/zip.ts';
import {findUp, parseDevRc} from '../devrc.ts';
import {usageHint} from '../usage.ts';
import {parseArgs} from './log.ts';
import {readConnection, type IConnectionInfo} from './sql.ts';

/** Databases no backup command should never touch. */
const SYSTEM_DATABASES = new Set(['mysql', 'information_schema', 'performance_schema', 'sys']);

/** `2026-11-06T13:45:02.123Z` → `20261106-134502`, which sorts chronologically. */
export function stamp(when: Date): string {
    const iso = when.toISOString();
    return `${iso.slice(0, 10).replaceAll('-', '')}-${iso.slice(11, 19).replaceAll(':', '')}`;
}

/** The archive name for one database at one moment. */
export function backupFileName(database: string, when: Date): string {
    const safe = database.replace(/[^a-zA-Z0-9._-]/g, '_');
    return `${safe}-${stamp(when)}.zip`;
}

/**
 * The predefined host folder a backup lands in.
 *
 * `cwd` is where the search for `rush.json` starts, so a developer who runs the
 * command inside a package still backs up into the repository's `dev/backup`
 * rather than into the package.
 */
export function backupDirectory(options: {
    cli?: string;
    env?: string;
    config?: string;
    cwd?: string;
}): {directory: string; source: string} {
    if (options.cli) return {directory: resolve(options.cli), source: '--output'};
    if (options.env) return {directory: resolve(options.env), source: '$BLONG_BACKUP_DIR'};
    if (options.config)
        return {directory: resolve(options.config), source: '.blong_devrc backup.path'};
    const cwd = options.cwd ?? process.cwd();
    const rush = findUp(cwd, 'rush.json');
    const root = rush ? dirname(rush) : cwd;
    return {directory: join(root, 'dev', 'backup'), source: 'dev/backup beside rush.json'};
}

/** The `backup.path` a developer configured, if any. */
function configuredBackupPath(cwd: string): string | undefined {
    const rc = findUp(cwd, '.blong_devrc');
    if (!rc) return undefined;
    try {
        const config = parseDevRc(readFileSync(rc, 'utf8'));
        const backup = config.backup;
        return backup && typeof backup === 'object'
            ? ((backup as {path?: string}).path ?? undefined)
            : undefined;
    } catch {
        // A malformed .blong_devrc is reported by every other command; here it
        // means "no configured path" rather than no backup at all.
        return undefined;
    }
}

/** Every database the server holds that is not an internal schema. */
export async function listDatabases(connection: IConnectionInfo): Promise<string[]> {
    const client = await createConnection({
        host: connection.host ?? 'localhost',
        port: connection.port ?? 3306,
        user: connection.user,
        password: connection.password,
    });
    try {
        const [rows] = await client.query<
            Array<Record<string, unknown>> & import('mysql2').RowDataPacket[]
        >('SELECT SCHEMA_NAME AS name FROM information_schema.schemata ORDER BY SCHEMA_NAME');
        return rows
            .map(row => String(row.name ?? Object.values(row)[0] ?? ''))
            .filter(name => name && !SYSTEM_DATABASES.has(name));
    } finally {
        await client.end().catch(() => {});
    }
}

/** Dump one database and write it as a zip; returns the archive path. */
async function backupDatabase(
    connection: IConnectionInfo,
    database: string,
    directory: string,
): Promise<{path: string; bytes: number}> {
    const client = await createConnection({
        host: connection.host ?? 'localhost',
        port: connection.port ?? 3306,
        user: connection.user,
        password: connection.password,
        database,
        // A backup reads rows the driver would otherwise re-type (a JSON column
        // would come back as an object and lose its exact text on the way out).
        jsonStrings: true,
    });
    const when = new Date();
    try {
        const sql = await dumpDatabase(client, database, {now: when});
        const manifest = {
            database,
            dumpedAt: when.toISOString(),
            host: connection.host ?? 'localhost',
            port: connection.port ?? 3306,
            server: connection.user ?? '',
            bytes: Buffer.byteLength(sql),
            tool: 'blong-dev db backup',
        };
        const archive = createZip(
            [
                {name: `${database}.sql`, data: Buffer.from(sql, 'utf8')},
                {
                    name: 'manifest.json',
                    data: Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, 'utf8'),
                },
            ],
            when,
        );
        if (!existsSync(directory)) mkdirSync(directory, {recursive: true});
        const path = join(directory, backupFileName(database, when));
        writeFileSync(path, archive);
        return {path, bytes: archive.length};
    } finally {
        await client.end().catch(() => {});
    }
}

export async function db(args: string[]): Promise<void> {
    const [subcommand, ...rest] = args;
    if (subcommand === 'list') {
        const {connection} = readConnection(parseArgs(rest));
        try {
            for (const name of await listDatabases(connection)) process.stdout.write(`${name}\n`);
        } catch (error) {
            process.stderr.write(`blong-dev db list: ${(error as Error).message}\n`);
            process.exitCode = 1;
        }
        return;
    }
    if (subcommand !== 'backup') {
        process.stderr.write(`blong-dev db: expected \`backup\` or \`list\`\n${usageHint('db')}\n`);
        process.exitCode = 1;
        return;
    }

    const parsed = parseArgs(rest);
    const {connection, source, derived} = readConnection(parsed);
    const {directory, source: dirSource} = backupDirectory({
        cli: parsed.options.get('output'),
        env: process.env.BLONG_BACKUP_DIR,
        config: configuredBackupPath(process.cwd()),
    });
    const all = parsed.flags.has('all');
    let databases: string[] = [];
    if (all) {
        try {
            databases = await listDatabases(connection);
        } catch (error) {
            process.stderr.write(`blong-dev db backup: ${(error as Error).message}\n`);
            process.exitCode = 1;
            return;
        }
        const only = parsed.options.get('database');
        if (only) databases = databases.filter(name => name.includes(only));
    } else {
        if (!connection.database) {
            process.stderr.write(
                'blong-dev db backup: no database — pass --database <name> or --suite <name>\n' +
                    `${usageHint('db', 'backup')}\n`,
            );
            process.exitCode = 1;
            return;
        }
        databases = [connection.database];
    }
    if (!databases.length) {
        process.stderr.write('blong-dev db backup: nothing matched\n');
        process.exitCode = 1;
        return;
    }
    process.stderr.write(
        `blong-dev db backup: ${databases.join(', ')}\n` +
            `  from ${source}${derived ? ' (derived)' : ''}\n` +
            `  into ${directory} (${dirSource})\n`,
    );
    let failed = false;
    for (const database of databases) {
        try {
            const {path, bytes} = await backupDatabase(connection, database, directory);
            process.stdout.write(`${path} (${(bytes / 1024).toFixed(1)} KiB)\n`);
        } catch (error) {
            failed = true;
            process.stderr.write(`blong-dev db backup: ${database}: ${(error as Error).message}\n`);
        }
    }
    if (failed) process.exitCode = 1;
}
