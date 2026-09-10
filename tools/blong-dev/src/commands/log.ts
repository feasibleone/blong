/**
 * `blong-dev log` — fetch log entries cached to disk by the pino-cacache
 * transport.
 *
 * Blong's pino-cacache transport stores full log entries on disk (default
 * `~/.blong/log-cache`) so they can be inspected on demand. The VS Code
 * extension reads them when clicking `blong://log/<ULID>` terminal links; this
 * command exposes the same data on the CLI for coding agents and humans.
 *
 * Output modes:
 *   - condensed (default): one compact plain-text line per entry — ideal for
 *     coding agents to grep and parse. Never colorized.
 *   - pretty: multi-line, colorized, human-readable output.
 *   - json: full JSON objects (id/time restored) for scripting.
 *
 * Usage:
 *   blong-dev log [ulid] [options]
 *
 * With a `ulid` argument the single entry is fetched and printed (defaults to
 * `--output json`). Without it, recent entries are listed (defaults to
 * `--output condensed`).
 *
 * Options:
 *   --cache-path <path>  cacache directory (default: ~/.blong/log-cache,
 *                        or $BLONG_LOG_CACHE)
 *   --output <fmt>       condensed | pretty | json
 *   --level <level>      minimum level: trace | debug | info | warn | error | fatal
 *   --name <name>        filter by service name (case-insensitive substring)
 *   --search <text>      free-text search across all entry properties
 *   --trace-id <id>      filter by exact trace ID
 *   --method <method>    filter by $meta.method (case-insensitive substring)
 *   --after <ulid>       only entries newer than this ULID
 *   --limit <n>          max entries (default: 50; 0 = all)
 *   --no-color           disable ANSI colors (pretty output)
 */
import * as cacache from 'cacache';
import {existsSync} from 'node:fs';
import {homedir} from 'node:os';
import {resolve} from 'node:path';

const DEFAULT_CACHE_PATH = '~/.blong/log-cache';
const RETENTION_STATE_KEY = '__blong_retention_state__';
const CONCURRENCY = 32;

/** Pino numeric level per name. */
const LEVELS: Record<string, number> = {
    trace: 10,
    debug: 20,
    info: 30,
    warn: 40,
    error: 50,
    fatal: 60,
};

/** Pino name per numeric level. */
const LEVEL_NAMES: Record<number, string> = {
    10: 'trace',
    20: 'debug',
    30: 'info',
    40: 'warn',
    50: 'error',
    60: 'fatal',
};

const ANSI = {
    reset: '\x1b[0m',
    dim: '\x1b[2m',
    gray: '\x1b[90m',
    red: '\x1b[31m',
    redBright: '\x1b[91m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
} as const;

const LEVEL_COLORS: Record<number, string> = {
    10: ANSI.gray,
    20: ANSI.blue,
    30: ANSI.green,
    40: ANSI.yellow,
    50: ANSI.red,
    60: ANSI.redBright,
};

interface ILogEntry {
    /** The cacache key — the entry's monotonic ULID. */
    id: string;
    /** Epoch milliseconds (restored from the entry's cacache metadata). */
    time: number;
    /** Pino numeric level. */
    level: number;
    /** Full entry with `id` and `time` restored. */
    data: Record<string, unknown>;
}

type OutputFormat = 'condensed' | 'pretty' | 'json';

interface IParsedArgs {
    positionals: string[];
    options: Map<string, string>;
    flags: Set<string>;
}

/** Minimal `--name value` / `--name=value` / `--flag` parser. */
export function parseArgs(args: string[]): IParsedArgs {
    const positionals: string[] = [];
    const options = new Map<string, string>();
    const flags = new Set<string>();
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (!arg.startsWith('--')) {
            positionals.push(arg);
            continue;
        }
        const eq = arg.indexOf('=');
        if (eq !== -1) {
            options.set(arg.slice(2, eq), arg.slice(eq + 1));
            continue;
        }
        const next = args[i + 1];
        if (next !== undefined && !next.startsWith('--')) {
            options.set(arg.slice(2), next);
            i++;
        } else {
            flags.add(arg.slice(2));
        }
    }
    return {positionals, options, flags};
}

function resolveCachePath(raw: string): string {
    return raw.startsWith('~/') ? resolve(homedir(), raw.slice(2)) : resolve(raw);
}

function levelOf(value: unknown): number {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') return LEVELS[value] ?? 30;
    return 30;
}

function quoteMessage(msg: string): string {
    return JSON.stringify(msg);
}

/** Read every log entry (content + restored id/time) from the cacache index. */
async function listEntries(cachePath: string): Promise<ILogEntry[]> {
    const index = await cacache.ls(cachePath);
    const keys = Object.keys(index).filter(key => key !== RETENTION_STATE_KEY);
    const entries: ILogEntry[] = [];
    let cursor = 0;
    const workerCount = Math.min(CONCURRENCY, keys.length);
    const workers = Array.from({length: workerCount}, async () => {
        while (cursor < keys.length) {
            const key = keys[cursor++];
            const info = index[key];
            try {
                const result = await cacache.get(cachePath, key);
                const parsed = JSON.parse(result.data.toString()) as Record<string, unknown>;
                const timestamp =
                    (result.metadata as {timestamp?: number} | undefined)?.timestamp ?? info.time;
                entries.push({
                    id: key,
                    time: timestamp,
                    level: levelOf(parsed.level),
                    data: {...parsed, id: key, time: timestamp},
                });
            } catch {
                // Skip entries whose content was pruned or is unreadable.
            }
        }
    });
    await Promise.all(workers);
    return entries;
}

function formatCondensed(entry: ILogEntry): string {
    const {id, time, level, data} = entry;
    const name = typeof data.name === 'string' ? data.name : '';
    const msg = typeof data.msg === 'string' ? data.msg : '';
    const iso = new Date(time).toISOString();
    const levelName = LEVEL_NAMES[level] ?? String(level);
    const extra: string[] = [`id=${id}`];
    const context = typeof data.context === 'string' ? data.context : '';
    if (context) extra.push(`context=${context}`);
    const $meta = data.$meta as {method?: string} | undefined;
    if ($meta?.method) extra.push(`method=${$meta.method}`);
    if (typeof data.traceId === 'string') extra.push(`traceId=${data.traceId}`);
    let line = `${iso} ${levelName.padEnd(5)} ${name}`;
    if (msg) line += ` ${quoteMessage(msg)}`;
    if (extra.length) line += `  ${extra.join(' ')}`;
    return line;
}

function formatPretty(entry: ILogEntry, useColor: boolean): string {
    const {id, time, level, data} = entry;
    const name = typeof data.name === 'string' ? data.name : '';
    const msg = typeof data.msg === 'string' ? data.msg : '';
    const iso = new Date(time).toISOString();
    const levelText = (LEVEL_NAMES[level] ?? String(level)).padEnd(5);
    const levelColor = LEVEL_COLORS[level] ?? ANSI.reset;
    const color = (code: string, text: string): string =>
        useColor ? `${code}${text}${ANSI.reset}` : text;
    const header = `[${iso}] ${color(levelColor, levelText)} (${color(
        ANSI.cyan,
        name,
    )}): ${msg ? quoteMessage(msg) : ''}`;
    const lines = [header.trimEnd(), `    id: ${color(ANSI.dim, id)}`];
    const SKIP = new Set(['id', 'time', 'level', 'name', 'msg', 'hostname', 'pid', 'v']);
    for (const key of Object.keys(data).sort()) {
        if (SKIP.has(key)) continue;
        const value = data[key];
        const text =
            value === null
                ? 'null'
                : typeof value === 'object'
                  ? JSON.stringify(value, null, 4)
                        .split('\n')
                        .map((line, i) => (i === 0 ? line : `    ${line}`))
                        .join('\n')
                  : typeof value === 'string'
                    ? value
                    : JSON.stringify(value);
        lines.push(`    ${color(ANSI.blue, key)}: ${text}`);
    }
    return lines.join('\n');
}

function formatJson(entry: ILogEntry): string {
    return JSON.stringify(entry.data);
}

export async function log(args: string[]): Promise<void> {
    const {positionals: positional, options, flags} = parseArgs(args);
    const cachePathRaw =
        options.get('cache-path') ?? process.env.BLONG_LOG_CACHE ?? DEFAULT_CACHE_PATH;
    const cachePath = resolveCachePath(cachePathRaw);

    if (!existsSync(cachePath)) {
        process.stderr.write(`blong-dev log: cache not found at ${cachePath}\n`);
        process.stderr.write(`  (set --cache-path or $BLONG_LOG_CACHE to override)\n`);
        process.exit(1);
    }

    const outputRaw = options.get('output') ?? (positional[0] ? 'json' : 'condensed');
    const output: OutputFormat | undefined = ['condensed', 'pretty', 'json'].includes(outputRaw)
        ? (outputRaw as OutputFormat)
        : undefined;
    if (!output) {
        process.stderr.write(
            `blong-dev log: invalid --output "${outputRaw}" (use condensed | pretty | json)\n`,
        );
        process.exit(1);
    }
    const useColor = output === 'pretty' && !flags.has('no-color') && process.stdout.isTTY === true;

    const entries = await listEntries(cachePath);

    if (positional[0]) {
        const id = positional[0];
        const entry = entries.find(e => e.id === id);
        if (!entry) {
            process.stderr.write(`blong-dev log: no entry with id ${id} in ${cachePath}\n`);
            process.exit(1);
        }
        if (output === 'json') process.stdout.write(formatJson(entry) + '\n');
        else if (output === 'pretty') process.stdout.write(formatPretty(entry, useColor) + '\n');
        else process.stdout.write(formatCondensed(entry) + '\n');
        return;
    }

    const minLevelRaw = options.get('level');
    const minLevel = minLevelRaw ? LEVELS[minLevelRaw.toLowerCase()] : undefined;
    if (minLevelRaw && minLevel === undefined) {
        process.stderr.write(
            `blong-dev log: invalid --level "${minLevelRaw}" (use trace | debug | info | warn | error | fatal)\n`,
        );
        process.exit(1);
    }
    const nameFilter = options.get('name');
    const searchFilter = options.get('search');
    const traceIdFilter = options.get('trace-id');
    const methodFilter = options.get('method');
    const afterFilter = options.get('after');
    const limitRaw = options.get('limit') ?? '50';
    const limit = Number(limitRaw);
    if (!Number.isFinite(limit) || limit < 0) {
        process.stderr.write(`blong-dev log: invalid --limit "${limitRaw}"\n`);
        process.exit(1);
    }

    const lower = (s: string): string => s.toLowerCase();
    const filtered = entries.filter(e => {
        if (minLevel !== undefined && e.level < minLevel) return false;
        if (
            nameFilter &&
            !(typeof e.data.name === 'string' && lower(e.data.name).includes(lower(nameFilter)))
        )
            return false;
        if (traceIdFilter && e.data.traceId !== traceIdFilter) return false;
        if (methodFilter) {
            const method = (e.data.$meta as {method?: string} | undefined)?.method ?? '';
            if (!lower(method).includes(lower(methodFilter))) return false;
        }
        if (searchFilter && !lower(JSON.stringify(e.data)).includes(lower(searchFilter)))
            return false;
        if (afterFilter && e.id <= afterFilter) return false;
        return true;
    });

    // Newest first (ULIDs are monotonic with time).
    filtered.sort((a, b) => b.time - a.time || b.id.localeCompare(a.id));

    const shown = limit > 0 ? filtered.slice(0, limit) : filtered;

    process.stderr.write(
        `blong-dev log: ${shown.length} of ${entries.length} cached entries (${cachePath})\n`,
    );
    for (const entry of shown) {
        if (output === 'json') process.stdout.write(formatJson(entry) + '\n');
        else if (output === 'pretty') process.stdout.write(formatPretty(entry, useColor) + '\n\n');
        else process.stdout.write(formatCondensed(entry) + '\n');
    }
}
