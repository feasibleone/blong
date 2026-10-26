/**
 * The file half of translation harvesting — **runner only**.
 *
 * This module reads and writes the seed files, so it imports `node:fs` and is
 * reachable only from the `playwright` entry points; the app bundle imports
 * `src/i18n` instead (`D-633`, `T-426`).
 *
 * Two guarantees shape it:
 *
 * - **A test never writes a seed.** It writes one pending file, named after its
 *   process and a random suffix, so parallel workers cannot collide.
 * - **One writer.** `mergePendingTranslations` runs in `globalTeardown`, takes an
 *   exclusive lock beside each seed, re-reads it inside that lock and writes
 *   atomically (tmp + rename), so two runs that finish together keep both sets
 *   of additions (`D-632`).
 */
import {
    closeSync,
    existsSync,
    mkdirSync,
    openSync,
    readFileSync,
    readdirSync,
    renameSync,
    rmSync,
    statSync,
    writeFileSync,
} from 'node:fs';
import {dirname, join} from 'node:path';

/** Where a run's per-test reports accumulate, relative to the seed's folder. */
const PENDING = '.pending';
/** A pending directory or lock older than this is debris from a dead run. */
const STALE_MS = 24 * 60 * 60 * 1000;

/** The seed targets a spec may declare. */
export interface ISeedOptions {
    language?: string;
    /** Path of the label seed, e.g. `meta/db/bg-coreLabelSeed.yaml`. */
    label?: string;
    /** Path of the resource seed. */
    translation?: string;
}

/** What a test reports: the keys it rendered that the dictionary could not answer. */
export interface ISeedReport {
    language?: string;
    missing?: readonly string[];
    missingResources?: readonly string[];
}

/** The folder a seed lives in — pending files go beside it, not inside it. */
function seedDir(options: ISeedOptions): string {
    const target = options.label ?? options.translation;
    if (!target) throw new Error('a translation seed needs a label or translation path');
    return dirname(target);
}

/**
 * The language and a block scalar's lines, from a seed file.
 *
 * The format is deliberately hand-editable: two keys, and one pair per line in a
 * YAML literal block, so a diff is one line per translation.
 */
export function parseSeed(text: string, block: string): Map<string, string> {
    const entries = new Map<string, string>();
    const lines = text.split(/\r?\n/);
    const start = lines.findIndex(line => new RegExp(`^${block}:\\s*\\|\\s*$`).test(line));
    if (start < 0) return entries;
    const body: string[] = [];
    for (let index = start + 1; index < lines.length; index++) {
        const line = lines[index];
        if (!line.trim()) {
            body.push('');
            continue;
        }
        if (!/^\s/.test(line)) break;
        body.push(line);
    }
    const indent = Math.min(
        ...body.filter(line => line.trim()).map(line => line.length - line.trimStart().length),
    );
    for (const raw of body) {
        const line = raw.slice(Number.isFinite(indent) ? indent : 0).trim();
        if (!line) continue;
        const at = line.indexOf('=');
        if (at < 0) continue;
        const key = line.slice(0, at).trim();
        if (!key) continue;
        entries.set(key, line.slice(at + 1).trim());
    }
    return entries;
}

/** The `languageCode` a seed declares, or the fallback. */
export function seedLanguage(text: string, fallback = 'bg'): string {
    const match = /^languageCode:\s*(\S+)\s*$/m.exec(text);
    return match ? match[1] : fallback;
}

/** Render a seed file: the language, then the sorted pairs of the block. */
export function serializeSeed(
    languageCode: string,
    block: string,
    entries: Map<string, string>,
): string {
    const lines = [...entries.entries()]
        .sort(([a], [b]) => a.localeCompare(b, 'en'))
        .map(([key, value]) => `    ${key}=${value}`);
    return `languageCode: ${languageCode}\n${block}: |\n${lines.join('\n')}\n`;
}

/**
 * Add the missing keys to a seed's text, keeping every line that is already
 * there — including an empty one, which is a TODO marker somebody may have
 * written by hand (`D-631`).
 */
export function mergeSeed(
    text: string,
    block: string,
    additions: Iterable<string>,
    fallbackLanguage = 'bg',
): {text: string; added: number; kept: number} {
    const entries = parseSeed(text, block);
    const languageCode = seedLanguage(text, fallbackLanguage);
    let added = 0;
    let kept = 0;
    for (const raw of additions) {
        const key = raw.trim();
        if (!key) continue;
        if (entries.has(key)) {
            kept++;
            continue;
        }
        entries.set(key, '');
        added++;
    }
    return {text: serializeSeed(languageCode, block, entries), added, kept};
}

/** Wait a few milliseconds without a timer, for the synchronous teardown. */
function pause(ms: number): void {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/** Run `fn` while holding `<file>.lock`, breaking a lock left by a dead run. */
function withLock<T>(file: string, fn: () => T): T {
    const lock = `${file}.lock`;
    for (let attempt = 0; attempt < 100; attempt++) {
        try {
            const fd = openSync(lock, 'wx');
            try {
                writeFileSync(fd, String(process.pid));
                return fn();
            } finally {
                closeSync(fd);
                rmSync(lock, {force: true});
            }
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
            try {
                if (Date.now() - statSync(lock).mtimeMs > 10_000) rmSync(lock, {force: true});
            } catch {
                // The holder released it between the two calls.
            }
            pause(20);
        }
    }
    throw new Error(`Could not lock ${lock} — remove it if no run is writing`);
}

/** Merge additions into one seed file under its lock, atomically. */
export function writeSeedFile(
    file: string,
    block: string,
    additions: Iterable<string>,
    fallbackLanguage = 'bg',
): {added: number; kept: number} {
    mkdirSync(dirname(file), {recursive: true});
    return withLock(file, () => {
        const current = existsSync(file) ? readFileSync(file, 'utf8') : '';
        const merged = mergeSeed(current, block, additions, fallbackLanguage);
        const {added, kept} = merged;
        if (!added) return {added, kept};
        const temporary = `${file}.${process.pid}.tmp`;
        writeFileSync(temporary, merged.text);
        renameSync(temporary, file);
        return {added, kept};
    });
}

/** The directory this run's per-test reports go to. */
export function pendingDir(options: ISeedOptions): string {
    const token = process.env['BLONG_TRANSLATION_RUN'] ?? 'run';
    return join(seedDir(options), PENDING, token);
}

/**
 * `globalSetup`: mint the run token and clear debris.
 *
 * The token keeps an aborted run's pending files away from this one; directories
 * a day old are removed because nothing will ever claim them.
 */
export function startTranslationRun(options: ISeedOptions): string {
    const base = join(seedDir(options), PENDING);
    const token = `${Date.now().toString(36)}-${process.pid}`;
    process.env['BLONG_TRANSLATION_RUN'] = token;
    if (existsSync(base)) {
        for (const entry of readdirSync(base)) {
            const path = join(base, entry);
            try {
                if (Date.now() - statSync(path).mtimeMs > STALE_MS)
                    rmSync(path, {recursive: true, force: true});
            } catch {
                // Lost a race with another reader; nothing to do.
            }
        }
    }
    mkdirSync(join(base, token), {recursive: true});
    return token;
}

/** Write one test's report; a no-op when the spec declared no seed. */
export function writePendingReport(options: ISeedOptions, report: ISeedReport): string | undefined {
    if (!options.label && !options.translation) return undefined;
    // No run token means no harvest run: `globalSetup` mints one, and a spec that
    // declares a seed in an ordinary run must not leave pending files nobody will
    // ever merge.
    if (!process.env['BLONG_TRANSLATION_RUN']) return undefined;
    if (!report?.missing?.length && !report?.missingResources?.length) return undefined;
    const dir = pendingDir(options);
    mkdirSync(dir, {recursive: true});
    const file = join(
        dir,
        `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`,
    );
    const temporary = `${file}.tmp`;
    writeFileSync(temporary, JSON.stringify(report));
    renameSync(temporary, file);
    return file;
}

/**
 * `globalTeardown`: merge every pending report of this run into the seeds.
 *
 * Called once per run, after every worker has finished, which is what makes it
 * the one writer (`D-632`). The return value is the run's summary line.
 */
export function mergePendingTranslations(options: ISeedOptions): {
    label: number;
    translation: number;
    runs: number;
} {
    if (!options.label && !options.translation) return {label: 0, translation: 0, runs: 0};
    const dir = pendingDir(options);
    if (!existsSync(dir)) return {label: 0, translation: 0, runs: 0};

    const labels = new Set<string>();
    const resources = new Set<string>();
    let runs = 0;
    for (const entry of readdirSync(dir)) {
        if (!entry.endsWith('.json')) continue;
        try {
            const report = JSON.parse(readFileSync(join(dir, entry), 'utf8')) as ISeedReport;
            runs++;
            for (const key of report.missing ?? []) labels.add(key);
            for (const key of report.missingResources ?? []) resources.add(key);
        } catch {
            // A half-written file cannot exist (tmp + rename), but a corrupt one
            // must not abort the merge of the others.
        }
    }

    const language = options.language ?? 'bg';
    let label = 0;
    let translation = 0;
    if (options.label && labels.size) {
        label = writeSeedFile(options.label, 'label', labels, language).added;
    }
    if (options.translation && resources.size) {
        translation = writeSeedFile(options.translation, 'translation', resources, language).added;
    }

    rmSync(dir, {recursive: true, force: true});
    return {label, translation, runs};
}
