/**
 * `blong-dev trace <trace.zip|dir>` — print a human-readable timeline from a
 * Playwright trace.
 *
 * Playwright traces (`trace.zip`) are not human-readable and failed tests
 * capture no screenshot, so this extracts the `*-trace.trace` chunks (action
 * events) and the `*-trace.network` chunks (request/response snapshots) and
 * prints the action timeline plus any failed requests, so the failure is
 * obvious at a glance. A trace is written in numbered chunks once a run records
 * more than one file's worth of events, so every chunk is read — a run whose
 * first chunk is `1-trace.trace` is otherwise a timeline that prints nothing.
 *
 * Usage:
 *   blong-dev trace .playwright/results/my-test/trace.zip
 */
import {execFileSync} from 'node:child_process';
import {mkdirSync, readdirSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {basename, join} from 'node:path';

interface ITraceEvent {
    type?: string;
    startTime?: number;
    class?: string;
    method?: string;
    params?: {selector?: string; url?: string; error?: unknown; [k: string]: unknown};
}

interface INetworkEvent {
    type?: string;
    snapshot?: {
        request?: {method?: string; url?: string};
        response?: {status?: number};
    };
}

const ACTION_METHODS = new Set([
    'click',
    'dblclick',
    'fill',
    'goto',
    'press',
    'pressSequentially',
    'waitFor',
    'waitForSelector',
    'waitForLoadState',
]);

function readJsonl(file: string): ITraceEvent[] {
    const out: ITraceEvent[] = [];
    try {
        for (const line of readFileSync(file, 'utf8').split('\n')) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            try {
                out.push(JSON.parse(trimmed) as ITraceEvent);
            } catch {
                // skip malformed lines
            }
        }
    } catch {
        // file may be absent
    }
    return out;
}

/**
 * The numbered chunks of one trace log, in order.
 *
 * Playwright names the files `0-trace.trace`, `1-trace.trace`, … (and the same for `-trace.network`),
 * splitting when a run records more than one file's worth of events. Reading only chunk zero made a
 * trace whose first chunk was a `1-` look like a run that did nothing, so every chunk is read and a
 * trace with none is reported rather than printed as an empty timeline.
 */
export function traceChunks(dir: string, kind: 'trace' | 'network'): string[] {
    let names: string[];
    try {
        names = readdirSync(dir);
    } catch {
        return [];
    }
    const suffix = `-trace.${kind}`;
    return names
        .filter(name => name.endsWith(suffix) && /^\d+-/.test(name))
        .sort((a, b) => Number.parseInt(a, 10) - Number.parseInt(b, 10))
        .map(name => join(dir, name));
}

function extract(file: string): string {
    const dest = join(tmpdir(), `blong-trace-${Date.now()}`);
    mkdirSync(dest, {recursive: true});
    try {
        execFileSync('unzip', ['-o', '-q', file, '-d', dest]);
    } catch {
        process.stderr.write(`Failed to extract ${file} (is 'unzip' installed?)\n`);
        process.exit(1);
    }
    return dest;
}

export async function trace(args: string[]): Promise<void> {
    const file = args[0];
    if (!file) {
        process.stderr.write('Usage: blong-dev trace <trace.zip|trace-dir>\n');
        process.exit(1);
    }
    const dir = file.endsWith('.zip') ? extract(file) : file;
    const base = basename(file);
    const traceFiles = traceChunks(dir, 'trace');
    if (traceFiles.length === 0) {
        process.stderr.write(`No *-trace.trace chunk in ${dir} — is this a Playwright trace?\n`);
    }
    const events = traceFiles.flatMap(readJsonl);
    const start = events.length ? (events[0].startTime ?? 0) : 0;

    process.stdout.write(`Trace: ${base}\n\n--- actions ---\n`);
    for (const e of events) {
        if (e.type !== 'before' || !e.method) continue;
        const m = e.method;
        if (!ACTION_METHODS.has(m)) continue;
        const t = ((e.startTime ?? 0) - start) / 1000;
        const sel = e.params?.selector ?? e.params?.url ?? '';
        const line = `[${t.toFixed(1).padStart(7)}s] ${e.class ?? ''}.${m} ${sel}`.trimEnd();
        process.stdout.write(line + '\n');
    }

    // Failed/odd HTTP responses.
    const net = traceChunks(dir, 'network').flatMap(readJsonl) as INetworkEvent[];
    const failed = new Set<string>();
    for (const n of net) {
        const status = n.snapshot?.response?.status ?? 0;
        if (status >= 400) {
            failed.add(
                `${status} ${n.snapshot?.request?.method ?? ''} ${n.snapshot?.request?.url ?? ''}`,
            );
        }
    }
    if (failed.size) {
        process.stdout.write('\n--- failed requests ---\n');
        for (const f of [...failed].sort()) process.stdout.write(f + '\n');
    } else {
        process.stdout.write('\n--- failed requests ---\n(none)\n');
    }

    // Console errors (params may be empty; args live in resources).
    const consoleErrors = events.filter(e => e.type === 'console');
    process.stdout.write(
        `\n--- console ---\n${consoleErrors.length} console events (error messages live in resources/)\n`,
    );

    if (file.endsWith('.zip')) rmSync(dir, {recursive: true, force: true});
}
