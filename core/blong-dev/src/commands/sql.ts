/**
 * `blong-dev sql` — run a SQL query against the local dev database.
 *
 * Reuses the developer's `.blong_devrc` (cwd → parents → ~) to resolve the DB
 * connection (default key `srv.db.knex.connection`, override with `--config`),
 * and prints the result as JSON (for coding agents / non-TTY) or as a
 * colorized aligned table (for humans / TTY).
 *
 * Usage:
 *   blong-dev sql "SELECT * FROM access_role"
 *   blong-dev sql "SELECT 1" --config mysql.sql
 *   blong-dev sql "SELECT 1" --output json
 *   blong-dev sql "UPDATE x SET y=1" --database blong-integration
 */

import {createConnection} from 'mysql2/promise';
import {readFileSync} from 'node:fs';
import {userInfo} from 'node:os';
import {join} from 'node:path';
import stripJsonComments from 'strip-json-comments';
import yaml from 'yaml';
import {findUp} from '../utils/findConfig.ts';
import {formatTable} from '../utils/table.ts';
import {parseArgs} from './log.ts';

const ANSI = {cyan: '\x1b[36m', dim: '\x1b[2m', reset: '\x1b[0m'} as const;

interface IConnectionInfo {
    host?: string;
    port?: number;
    user?: string;
    password?: string;
    database?: string;
}

/** Parse `.blong_devrc` content (JSON-with-comments or YAML), mirroring blong-config. */
export function parseDevRc(content: string): Record<string, unknown> {
    if (/^\s*{/.test(content)) {
        return JSON.parse(stripJsonComments(content)) as Record<string, unknown>;
    }
    const result = yaml.parse(content);
    return result && typeof result === 'object' ? (result as Record<string, unknown>) : {};
}

/** Resolve a dot path (e.g. `srv.db`) on the parsed config. */
export function getPath(config: Record<string, unknown>, path: string): unknown {
    return path.split('.').reduce<unknown>((acc, key) => {
        if (acc && typeof acc === 'object') return (acc as Record<string, unknown>)[key];
        return undefined;
    }, config);
}

/**
 * The dev database naming pattern, mirroring the `dev` block of the shared
 * `srv.db` adapter (`core/blong-server/adapter/db.ts`):
 * `[suite, user].map(s => s.toLowerCase().replaceAll("$", "").replace(/[^a-z0-9-]/g, "_")).join("-")`
 * e.g. suite `my-suite` + user `dev` → `my-suite-dev` (lowercased, `$` stripped,
 * non-alphanumerics → `_`).
 */
export function devDbName(suite: string, user: string): string {
    return [suite, user]
        .map(s =>
            s
                .toLowerCase()
                .replaceAll('$', '')
                .replace(/[^a-z0-9-]/g, '_'),
        )
        .join('-');
}

/** Render the `${suite}` / `${user}` template expressions used in connection values. */
function renderTemplate(value: string, ctx: {suite?: string; user?: string}): string {
    return value.replaceAll('${suite}', ctx.suite ?? '').replaceAll('${user}', ctx.user ?? '');
}

/** The os user, matching the `user` context var used by the dev DB naming template. */
export function currentUser(): string {
    return process.env.USER || userInfo().username || 'unknown';
}

/**
 * Resolve the suite name used to derive a dev database name, in priority order:
 *   1. `--suite` CLI override
 *   2. top-level `suite` key in `.blong_devrc`
 *   3. cwd `package.json` `name` (scope stripped)
 *
 * Falls back to `undefined` (no derivation) when none is available.
 */
export function resolveSuite(
    config: Record<string, unknown> | undefined,
    args: ReturnType<typeof parseArgs>,
): string | undefined {
    const cliSuite = args.options.get('suite');
    if (cliSuite) return cliSuite;
    const configSuite =
        config && typeof config === 'object'
            ? (config as Record<string, unknown>).suite
            : undefined;
    if (typeof configSuite === 'string' && configSuite) return configSuite;
    try {
        const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as {
            name?: string;
        };
        if (typeof pkg.name === 'string' && pkg.name) {
            return pkg.name.replace(/^@[^/]+\//, '');
        }
    } catch {
        // No readable package.json — the caller prints a hint to pass --database/--suite.
    }
    return undefined;
}

/**
 * Resolve the DB connection from `.blong_devrc` (+ `--config` key), with CLI
 * overrides (`--host/--port/--user/--password/--database`) taking precedence.
 *
 * When no `database` is configured, it falls back to the dev naming pattern
 * `${suite}-${user}` (see {@link devDbName}) so an agent can run
 * `blong-dev sql "SELECT ..."` without knowing the derived dev database name.
 * `${suite}` / `${user}` template expressions inside a configured value are
 * rendered with the resolved suite / os user.
 */
export function readConnection(args: ReturnType<typeof parseArgs>): {
    connection: IConnectionInfo;
    source: string;
} {
    const configKey = args.options.get('config') ?? 'srv.db';
    const configPath = findUp(process.cwd(), '.blong_devrc');
    let config: Record<string, unknown> | undefined;
    let connection: IConnectionInfo = {};
    if (configPath) {
        config = parseDevRc(readFileSync(configPath, 'utf8'));
        const node = getPath(config, configKey);
        const nested =
            node && typeof node === 'object'
                ? ((node as {knex?: {connection?: IConnectionInfo}}).knex?.connection ??
                  (node as {connection?: IConnectionInfo}).connection)
                : undefined;
        connection = {...(nested ?? {})};
    }
    const o = args.options;
    if (o.has('host')) connection.host = o.get('host');
    if (o.has('port')) connection.port = Number(o.get('port'));
    if (o.has('user')) connection.user = o.get('user');
    if (o.has('password')) connection.password = o.get('password');
    if (o.has('database')) connection.database = o.get('database');

    let source = configPath ? `${configKey} (${configPath})` : configKey;
    const suite = resolveSuite(config, args);
    const user = currentUser();
    if (connection.database) {
        connection.database = renderTemplate(connection.database, {suite, user});
    } else if (suite) {
        connection.database = devDbName(suite, user);
        source = `${source} — derived dev DB (${connection.database})`;
    }
    return {connection, source};
}

export async function sql(args: string[]): Promise<void> {
    const parsed = parseArgs(args);
    const {positionals, options: o, flags} = parsed;
    const query = (positionals.join(' ') || o.get('query') || '').trim();
    if (!query) {
        process.stderr.write('blong-dev sql: no query provided\n');
        process.stderr.write(
            'Usage: blong-dev sql "SELECT ..." [--config srv.db] [--output json|pretty] [--no-color]\n',
        );
        process.stderr.write(
            '       [--host h] [--port p] [--user u] [--password p] [--database d] [--suite s]\n',
        );
        process.stderr.write(
            '       (database falls back to the dev naming pattern {suite}-{user})\n',
        );
        process.exit(1);
    }

    const {connection, source} = readConnection(parsed);
    const outputRaw = o.get('output') ?? (process.stdout.isTTY === true ? 'pretty' : 'json');
    const output: 'json' | 'pretty' | undefined = ['json', 'pretty'].includes(outputRaw)
        ? (outputRaw as 'json' | 'pretty')
        : undefined;
    if (!output) {
        process.stderr.write(
            `blong-dev sql: invalid --output "${outputRaw}" (use json | pretty)\n`,
        );
        process.exit(1);
    }
    const useColor = output === 'pretty' && !flags.has('no-color') && process.stdout.isTTY === true;

    let client: Awaited<ReturnType<typeof createConnection>> | undefined;
    try {
        client = await createConnection({
            host: connection.host ?? 'localhost',
            port: connection.port ?? 3306,
            user: connection.user,
            password: connection.password,
            database: connection.database,
        });
        const [rows] = await client.query(query);
        if (output === 'json') {
            process.stdout.write(JSON.stringify(rows, null, 2) + '\n');
            return;
        }
        if (Array.isArray(rows)) {
            process.stdout.write(
                formatTable(rows as Array<Record<string, unknown>>, {
                    name: useColor ? `${ANSI.dim}${source}${ANSI.reset}` : source,
                    headerColor: useColor
                        ? (text: string) => `${ANSI.cyan}${text}${ANSI.reset}`
                        : undefined,
                }) + '\n',
            );
        } else {
            const header = rows as {
                affectedRows?: number;
                insertId?: number | bigint;
                changedRows?: number;
            };
            const bits = [`affectedRows: ${header.affectedRows ?? 0}`];
            if (header.insertId !== undefined) bits.push(`insertId: ${header.insertId}`);
            if (header.changedRows !== undefined) bits.push(`changedRows: ${header.changedRows}`);
            process.stdout.write(bits.join('  ') + '\n');
        }
    } catch (error) {
        const err = error as {code?: string; errno?: number; message?: string};
        process.stderr.write(`blong-dev sql: ${err.message ?? String(error)}\n`);
        if (err.code) {
            process.stderr.write(
                `  code: ${err.code}${err.errno !== undefined ? ` (errno ${err.errno})` : ''}\n`,
            );
        }
        process.exitCode = 1;
    } finally {
        await client?.end().catch(() => {});
    }
}
