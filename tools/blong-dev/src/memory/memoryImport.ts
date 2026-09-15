/**
 * Reading a batch of entries authored outside the CLI (`memory import`).
 *
 * The batch is JSON so it can be reviewed before it is written, and it is only
 * ever *read* here: the memory files themselves are written by the CLI, which is
 * what keeps the format and the generated index authoritative.
 *
 * Shape — the object form, or a bare array of entries:
 *
 * ```json
 * {
 *   "kind": "friction",
 *   "manual": ["the user's own item"],
 *   "entries": [
 *     {"title": "…", "body": "…", "area": "core/blong-browser", "status": "resolved", "date": "2026-09-11"}
 *   ]
 * }
 * ```
 */

import {KIND_STATUSES, MAX_TITLE_LENGTH, type MemoryKind} from './memoryTypes.ts';

/** One entry as authored in a batch file. */
export interface IImportEntry {
    title: string;
    body: string;
    area: string;
    status: string;
    date: string;
}

export interface IImportPlan {
    kind: MemoryKind;
    entries: IImportEntry[];
    /** User-owned todo items, verbatim. */
    manual: string[];
    /** Everything that would stop the batch from being written. */
    problems: string[];
    /** Things worth saying out loud, but not errors. */
    notes: string[];
}

export interface IImportOptions {
    /** Kind for entries that do not name one; a file may name its own. */
    kind?: MemoryKind;
    /** Area for entries that do not name one. */
    defaultArea?: string;
    /** Status for entries that do not name one. */
    defaultStatus?: string;
    /** Used for an entry with no date, and reported as a note. */
    today: string;
    /** Where the batch came from, for the problem messages. */
    source: string;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function asText(value: unknown): string {
    return typeof value === 'string' ? value : '';
}

/** Parse one batch file. Never throws: problems come back in the plan. */
export function parseImport(source: string, text: string, options: IImportOptions): IImportPlan {
    const plan: IImportPlan = {
        kind: options.kind ?? 'friction',
        entries: [],
        manual: [],
        problems: [],
        notes: [],
    };

    let parsed: unknown;
    try {
        parsed = JSON.parse(text);
    } catch (error) {
        plan.problems.push(`${source}: not valid JSON — ${(error as Error).message}`);
        return plan;
    }

    const wrapper = Array.isArray(parsed) ? {} : (parsed as Record<string, unknown>);
    const list = Array.isArray(parsed) ? parsed : wrapper['entries'];
    if (!Array.isArray(list)) {
        plan.problems.push(
            `${source}: expected an array of entries, or an object with an "entries" array`,
        );
        return plan;
    }

    const declared = asText(wrapper['kind']).trim() as MemoryKind;
    if (declared) {
        if (Object.hasOwn(KIND_STATUSES, declared)) plan.kind = declared;
        else plan.problems.push(`${source}: unknown kind "${declared}"`);
    }
    const defaultArea =
        asText(wrapper['defaultArea']).trim() || options.defaultArea || 'cross-cutting';
    const defaultStatus = asText(wrapper['defaultStatus']).trim() || options.defaultStatus || '';
    const manual = wrapper['manual'];
    if (manual !== undefined) {
        if (!Array.isArray(manual))
            plan.problems.push(`${source}: "manual" must be an array of strings`);
        else
            plan.manual.push(
                ...manual.map(item => asText(item).trim()).filter(item => item !== ''),
            );
    }

    list.forEach((raw, index) => {
        const at = `${source} entry ${index + 1}`;
        if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
            plan.problems.push(`${at}: expected an object`);
            return;
        }
        const item = raw as Record<string, unknown>;
        const title = asText(item['title']).replace(/\s+/g, ' ').trim();
        const body = asText(item['body']).replace(/\r\n/g, '\n').trim();
        const area = asText(item['area']).trim() || defaultArea;
        const status =
            asText(item['status']).trim() || defaultStatus || KIND_STATUSES[plan.kind][0]!;
        let date = asText(item['date']).trim();

        if (title === '') {
            plan.problems.push(`${at}: no title`);
            return;
        }
        if (title.length > MAX_TITLE_LENGTH) {
            plan.problems.push(
                `${at}: title is ${title.length} characters (max ${MAX_TITLE_LENGTH}) — "${title}"`,
            );
        }
        if (date === '') {
            date = options.today;
            plan.notes.push(`${at}: no date — used ${options.today}`);
        } else if (!DATE.test(date)) {
            plan.problems.push(`${at}: date "${date}" is not YYYY-MM-DD`);
        }
        if (!KIND_STATUSES[plan.kind].includes(status)) {
            plan.problems.push(
                `${at}: status "${status}" is not one of ${KIND_STATUSES[plan.kind].join(', ')}`,
            );
        }
        plan.entries.push({title, body, area, status, date});
    });

    if (plan.manual.length > 0 && plan.kind !== 'todo') {
        plan.problems.push(
            `${source}: "manual" only applies to todo batches (this one is ${plan.kind})`,
        );
    }
    return plan;
}

/** Merge the plans of several batch files, keeping their kind in step. */
export function mergePlans(plans: readonly IImportPlan[]): IImportPlan {
    const merged: IImportPlan = {
        kind: plans[0]?.kind ?? 'friction',
        entries: [],
        manual: [],
        problems: [],
        notes: [],
    };
    for (const plan of plans) {
        if (plan.kind !== merged.kind) {
            merged.problems.push(`mixed kinds in one import: ${merged.kind} and ${plan.kind}`);
        }
        merged.entries.push(...plan.entries);
        merged.manual.push(...plan.manual);
        merged.problems.push(...plan.problems);
        merged.notes.push(...plan.notes);
    }
    return merged;
}

/** An entry that is already written, as far as duplicate detection needs it. */
export interface IExistingEntry {
    id: string;
    title: string;
    body: string;
}

/**
 * The comparison key for duplicate detection.
 *
 * Wrapping and punctuation differ between a batch and the file it was written to
 * (the CLI re-wraps the body), so the key is the words: case, whitespace and
 * backticks all removed.
 */
export function entryKey(title: string, body: string): string {
    return `${title} ${body}`
        .toLowerCase()
        .replace(/[`*_]/g, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

/**
 * Entries in a batch that are already in the tree, or repeated inside the batch.
 *
 * A batch applied twice duplicates everything it holds — which is invisible until
 * `memory audit` reports two ids for one finding, and then has to be untangled by
 * hand — so importing is refused unless the caller insists with `--force`.
 */
export function duplicateEntries(
    entries: readonly IImportEntry[],
    existing: readonly IExistingEntry[],
): string[] {
    const problems: string[] = [];
    const known = new Map<string, string>();
    for (const entry of existing) known.set(entryKey(entry.title, entry.body), entry.id);

    const seen = new Map<string, number>();
    entries.forEach((entry, index) => {
        const key = entryKey(entry.title, entry.body);
        const first = seen.get(key);
        if (first !== undefined) {
            problems.push(`entry ${index + 1}: repeats entry ${first + 1} of this batch — "${entry.title}"`);
            return;
        }
        seen.set(key, index);
        const id = known.get(key);
        if (id !== undefined) {
            problems.push(`entry ${index + 1}: already written as ${id} — "${entry.title}"`);
        }
    });
    return problems;
}
