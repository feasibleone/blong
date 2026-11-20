/**
 * `blong-dev legacy` — the level calls lukaot has not replaced yet, by package.
 *
 * lukaot has no level API: a record is a method of a declared vocabulary, and a package that still
 * writes `log?.warn?.(…)` has not been swept. The compatibility logger (`compat.ts`) gives such a
 * call an identity at run time, but the inventory has to be readable *before* the run and without
 * one — the list is the work order, and a work order that only appears after the code executes omits
 * every branch nobody exercises.
 *
 * So this reads the source: one line per package, the sites behind it on request, and `check` for the
 * day the number is meant to be zero. What it counts is a call, not a message: two calls in one
 * function are two, because each is one edit.
 *
 * ## What it deliberately does not count
 *
 * `request.log`, `fastify.log` and `app.log` are fastify's own pino logger — the server's internals,
 * not the framework's `ILog`. They are implementation detail of the HTTP layer, they exist whether or
 * not a realm declares anything, and an entry for them would be a task nobody can complete.
 *
 * `log.logger(level, bindings)` is not counted either: it is the pino-shaped face the framework hands
 * to fastify's `loggerInstance`, used by the loader and the registry rather than by a component
 * writing a line. What is counted is the one thing a sweep removes — `log?.<level>?.(…)`.
 *
 * Usage:
 *   blong-dev legacy [list]        [--root <path>] [--json]
 *   blong-dev legacy sites         [--root <path>] [--json]
 *   blong-dev legacy check         [--root <path>]
 */

import {readdir, readFile} from 'node:fs/promises';
import {join, relative} from 'node:path';

import {repoRoot} from '../report/reportPaths.ts';
import {helpText, usageHint} from '../usage.ts';
import {UsageError} from '../utils/usageError.ts';
import {parseArgs} from './log.ts';

/** The verbs {@link usageHint} may name when a call fails. */
const LEGACY_VERBS = new Set(['list', 'sites', 'check']);

/** The level members a package that has not been swept still calls. */
const LEVELS = 'trace|debug|info|warn|error|fatal';

/**
 * A level call on a `log` receiver, with and without optional chaining.
 *
 * `log.info(`, `log?.info?.(`, `x.log?.warn?.(` and `self.log?.error?.(` are one shape: a receiver's
 * `log`, a level member, a call. The members are listed rather than matched as any word, because
 * `log?.write?.()` and `log?.child?.()` are not level calls.
 */
const CALL = new RegExp(`\\.log\\??\\.(?:${LEVELS})\\??\\.?\\(`, 'g');

/** fastify's own logger, which is the HTTP server's rather than a caller's. */
const NOT_OURS = /(?:request|fastify|app)\.log/;

/** Directories that hold no source of ours. */
const SKIP = new Set(['node_modules', 'dist', 'coverage', '.git', 'temp', 'rush-logs']);

/**
 * A path prefix that is generated rather than written: `common/deploy` is a 1.4 GB assembly of the
 * packages (gitignored), so counting there would report every call twice and in a tree nobody edits.
 */
const GENERATED = ['common/deploy/'];

/** Whether a line is a comment, where an example of the shape is not a call. */
function isComment(line: string): boolean {
    const text = line.trimStart();
    return text.startsWith('*') || text.startsWith('//') || text.startsWith('/*');
}

/** One call site, as a reader would open it. */
export interface ILegacySite {
    /** The file, relative to the scanned root. */
    file: string;
    line: number;
    /** The line, trimmed, so a reader knows what to change without opening it. */
    text: string;
}

/** One package's share of the work order. */
export interface ILegacyPackage {
    package: string;
    count: number;
    sites: ILegacySite[];
}

/** The whole inventory, in the order it is reported (largest first). */
export interface ILegacyReport {
    total: number;
    packages: ILegacyPackage[];
}

/** Whether a file is source of ours: TypeScript, and not a test or a declaration. */
function isSource(name: string): boolean {
    if (!name.endsWith('.ts') && !name.endsWith('.tsx')) return false;
    if (name.endsWith('.d.ts')) return false;
    if (name.endsWith('.test.ts') || name.endsWith('.test.tsx')) return false;
    if (name.endsWith('.play.ts')) return false;
    return true;
}

/** Every source file under `dir`, recursively, skipping the folders that hold none of ours. */
async function sources(dir: string, out: string[] = []): Promise<string[]> {
    const entries = await readdir(dir, {withFileTypes: true}).catch(() => []);
    for (const entry of entries) {
        if (entry.isDirectory()) {
            if (!SKIP.has(entry.name)) await sources(join(dir, entry.name), out);
        } else if (entry.isFile() && isSource(entry.name)) {
            out.push(join(dir, entry.name));
        }
    }
    return out;
}

/**
 * The package a file belongs to: the two path segments a repository's layout gives it
 * (`core/blong-gogo`, `realm/blong-chat`), or the containing folder when the file sits shallower.
 */
function packageOf(file: string): string {
    const parts = file.split('/');
    return parts.length > 2 ? `${parts[0]}/${parts[1]}` : (parts[0] ?? '.');
}

/**
 * Count the level calls under `root`, grouped by package.
 *
 * Exported so a caller — this command's own test, or a script — can ask the question without
 * parsing the report.
 */
export async function legacyReport(root: string): Promise<ILegacyReport> {
    const files = await sources(root);
    const byPackage = new Map<string, ILegacySite[]>();
    for (const absolute of files) {
        const text = await readFile(absolute, 'utf8').catch(() => '');
        if (!text.includes('log')) continue;
        // Relative once per file: the same path is repeated for every call it holds.
        const file = relative(root, absolute).split('\\').join('/');
        if (GENERATED.some(prefix => file.startsWith(prefix))) continue;
        const name = packageOf(file);
        for (const [index, line] of text.split('\n').entries()) {
            if (NOT_OURS.test(line) || isComment(line)) continue;
            CALL.lastIndex = 0;
            while (CALL.exec(line) !== null) {
                const sites = byPackage.get(name) ?? [];
                sites.push({file, line: index + 1, text: line.trim()});
                byPackage.set(name, sites);
            }
        }
    }
    const packages: ILegacyPackage[] = [...byPackage.entries()]
        .map(([name, sites]) => ({package: name, count: sites.length, sites}))
        .sort((a, b) => b.count - a.count || a.package.localeCompare(b.package));
    return {total: packages.reduce((sum, item) => sum + item.count, 0), packages};
}

/** The column the counts line up in, wide enough for the longest package name. */
function width(report: ILegacyReport): number {
    return Math.max(0, ...report.packages.map(item => item.package.length));
}

/** The tree to scan: the repository's own unless `--root` names another. */
function rootOf(options: Map<string, string>): string {
    return options.get('root') ?? repoRoot(process.cwd());
}

/** `blong-dev legacy [verb] [--root <path>] [--json]` */
export async function legacy(args: string[]): Promise<void> {
    const {positionals, options, flags} = parseArgs(args);
    const [verb = 'list', ...rest] = positionals;
    if (flags.has('help') || verb === 'help') {
        process.stdout.write(helpText('legacy', verb === 'help' ? undefined : verb));
        return;
    }
    if (!LEGACY_VERBS.has(verb) || rest.length > 0) {
        throw new UsageError(usageHint('legacy', verb));
    }
    const report = await legacyReport(rootOf(options));
    if (flags.has('json')) {
        process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    } else if (verb === 'list') {
        process.stdout.write(listText(report));
    } else if (verb === 'sites') {
        process.stdout.write(sitesText(report));
    }
    if (verb === 'check' && report.total > 0) {
        process.stderr.write(
            `blong-dev legacy: ${report.total} level call(s) in ${report.packages.length} package(s) ` +
                `are still unswept\n`,
        );
        process.exitCode = 1;
    }
}

/** The default report: one line per package, largest first. */
function listText(report: ILegacyReport): string {
    if (report.total === 0)
        return 'every package writes its records through a declared vocabulary\n';
    const pad = width(report);
    const lines = report.packages.map(item => `  ${item.package.padEnd(pad)}  ${item.count}`);
    return [
        'Level calls still to sweep, by package (each is one call site, not one message):',
        ...lines,
        '',
        `  ${String(report.total).padStart(pad)} total — \`blong-dev legacy sites\` lists them`,
        '',
    ].join('\n');
}

/** The same inventory with every site, so the work order can be worked. */
function sitesText(report: ILegacyReport): string {
    if (report.total === 0)
        return 'every package writes its records through a declared vocabulary\n';
    const lines: string[] = [];
    for (const item of report.packages) {
        lines.push(`${item.package} (${item.count})`);
        for (const site of item.sites) lines.push(`  ${site.file}:${site.line}  ${site.text}`);
        lines.push('');
    }
    return `${lines.join('\n')}`;
}
