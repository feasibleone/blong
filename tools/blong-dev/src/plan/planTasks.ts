/**
 * Turning a plan's work breakdown into memory todos, and trimming the plan back to a
 * board of titles.
 *
 * This is the moment the plan stops being the place the detail lives. Each task's
 * checkbox, title and area become a `T-` entry in the package's `todo.md`; its detail
 * becomes that entry's body; the plan keeps the checkbox, the title and the new
 * `@@T-531` token. From then on the detail is maintained with `memory edit`, and the
 * plan is what a reader watches (`@@D-…` — see the plan workflow doc).
 *
 * The link is written with the id, not later: a plan trimmed to bare tokens leaves the
 * reader searching, and writing it here means the issue published from the same plan
 * already links every task to its entry (`@@D-811`).
 *
 * A dry run is the default. `--apply` is the write, and it is idempotent: a task that
 * already names an id is skipped, so running it twice creates nothing twice.
 *
 * The decisions list under `### Decisions this plan takes` is converted by the same rule and in the
 * same run: a planning decision is an entry a comment can cite before any code exists, so it is
 * created with the tasks rather than left as prose (@@D-861).
 */

import {basename, dirname} from 'node:path';

import {writeFileSync} from 'node:fs';
import {addMemoryEntry, replaceMemoryEntry} from '../memory/memoryAdd.ts';
import {bodyLines} from '../memory/memoryEdit.ts';
import {MAX_TITLE_LENGTH} from '../memory/memoryTypes.ts';
import {listEntries} from '../memory/memoryView.ts';
import {UsageError} from '../utils/usageError.ts';
import {entryLink} from './planLinks.ts';
import {
    renderPlan,
    taskBodyText,
    trimDecisionsToLines,
    trimTasksToLines,
    type IPlanDecision,
    type IPlanDocument,
    type IPlanTask,
} from './planParse.ts';

/** What one run did, or would do. */
export interface ITaskOutcome {
    task: IPlanTask;
    id: string;
    /** Repository-relative path of the memory file the entry landed in. */
    path?: string;
}

/** Everything a run reports. */
export interface ICreateTasksResult {
    created: ITaskOutcome[];
    updated: ITaskOutcome[];
    skipped: number;
    /** Tasks the parser could not turn into an entry, with the reason. */
    failures: string[];
    /** The plan after trimming, when the run applied. */
    plan: IPlanDocument;
}

/** The slug a plan folder gives, e.g. `agent` for `plans/agent/plan.md`. */
export function planSlug(path: string): string {
    return basename(dirname(path));
}

/** The issue a plan is mirrored into, when it has one. */
export interface IPlanIssueRef {
    number?: number;
    url: string;
}

/**
 * The issue a plan's front matter records, if any.
 *
 * The number is read from `issue:` and the address from `issueUrl:`; a plan published before one of
 * them was recorded still gets a sentence, because the URL is what makes it clickable.
 */
export function planIssue(
    plan: IPlanDocument | {meta: Record<string, unknown>},
): IPlanIssueRef | undefined {
    const meta = plan.meta as Record<string, unknown>;
    const url = typeof meta['issueUrl'] === 'string' ? meta['issueUrl'].trim() : '';
    if (url === '') return undefined;
    const raw = meta['issue'];
    const number = typeof raw === 'number' ? raw : Number(raw);
    return {url, ...(typeof raw !== 'undefined' && Number.isFinite(number) ? {number} : {})};
}

/**
 * The sentence that traces an entry back to the plan it came from.
 *
 * A plan is a local folder and a board at once, and the folder is gitignored: once the plan has an
 * issue, the issue is the thing any reader — and any other host — can open, and it says itself
 * whether a local copy still exists. So the sentence names the issue from the moment it is
 * published rather than waiting for the folder to be released (`@@D-967`).
 */
export function provenanceLine(slug: string, issue?: IPlanIssueRef): string {
    if (issue) {
        return issue.number === undefined
            ? `Planned in [the plan](${issue.url}).`
            : `Planned in [#${issue.number}](${issue.url}).`;
    }
    return `Planned in \`plans/${slug}/plan.md\`.`;
}

/** The body a task's detail becomes. */
export function taskEntryBody(slug: string, detail: string, issue?: IPlanIssueRef): string[] {
    const line = provenanceLine(slug, issue);
    const text = detail.trim() === '' ? line : `${line}\n\n${detail.trim()}`;
    return bodyLines(text);
}

/**
 * Create the entries a plan's tasks describe, and trim what was created.
 *
 * Validation happens before any write: a task without a title, a detail that opens a
 * heading (which would break the entry the memory file parses), or a title over the
 * limit fails the whole run rather than leaving half a plan converted. The one thing
 * that does not fail is a task with no detail — the entry is then just its title, and
 * the run says so.
 */
export async function createPlanTasks(
    root: string,
    plan: IPlanDocument,
    options: {apply?: boolean; update?: boolean; area?: string; slug?: string; date?: string},
): Promise<ICreateTasksResult> {
    const slug = options.slug ?? plan.meta.slug ?? planSlug(plan.path);
    const issue = planIssue(plan);
    const created: ITaskOutcome[] = [];
    const updated: ITaskOutcome[] = [];
    const failures: string[] = [];
    const ids = new Map<IPlanTask, string>();
    const links = new Map<IPlanTask, string>();
    // Every id a reader follows is resolved against the entry it names, so a task that was
    // already converted gains the link on the next run and a retitled entry gets a new anchor.
    const entries = new Map(listEntries(root).map(entry => [entry.id, entry]));
    let skipped = 0;

    for (const task of plan.tasks) {
        const detail = taskBodyText(task);
        const heading = task.body.find(line => /^#{1,6}\s/.test(line));
        if (heading) {
            failures.push(
                `line ${task.line + 1}: "${task.title}" contains a heading ` +
                    `("${heading.trim()}") — a memory entry holds prose, not sections`,
            );
            continue;
        }
        if (task.id) {
            skipped += 1;
            const entry = entries.get(task.id);
            if (entry) links.set(task, entryLink(root, plan.path, entry));
            if (options.update && detail !== '') {
                if (options.apply) {
                    await replaceMemoryEntry(root, task.id, {
                        title: task.title,
                        body: taskEntryBody(slug, detail, issue),
                    });
                }
                updated.push({task, id: task.id});
            }
            continue;
        }
        const area = task.area ?? options.area;
        if (!area) {
            failures.push(`line ${task.line + 1}: "${task.title}" names no area`);
            continue;
        }
        if (task.title.length > MAX_TITLE_LENGTH) {
            failures.push(
                `line ${task.line + 1}: the title is ${task.title.length} characters; ` +
                    `keep it under ${MAX_TITLE_LENGTH}`,
            );
            continue;
        }
        if (!options.apply) {
            // A dry run reports the title and area it would use and allocates nothing, so
            // the ids it prints are placeholders a caller must not rely on.
            created.push({task, id: '(new)'});
            continue;
        }
        const entry = await addMemoryEntry(root, {
            kind: 'todo',
            title: task.title,
            area,
            body: taskEntryBody(slug, detail, issue),
            date: options.date,
        });
        ids.set(task, entry.id);
        links.set(
            task,
            entryLink(root, plan.path, {
                id: entry.id,
                title: task.title,
                path: entry.path,
            }),
        );
        created.push({task, id: entry.id, path: entry.path});
    }

    if (failures.length > 0) {
        throw new UsageError(
            `the plan's tasks cannot be created:\n${failures.map(line => `  ${line}`).join('\n')}`,
        );
    }

    if (!options.apply) {
        return {created, updated, skipped, failures, plan};
    }

    const trimmed = trimTasksToLines(plan, ids, links);
    writeFileSync(trimmed.path, renderPlan(trimmed), 'utf8');
    return {created, updated, skipped, failures, plan: trimmed};
}

/** What one decision run did, or would do. */
export interface IDecisionOutcome {
    decision: IPlanDecision;
    id: string;
    /** Repository-relative path of the memory file the entry landed in. */
    path?: string;
}

/** Everything a decision run reports. */
export interface ICreateDecisionsResult {
    created: IDecisionOutcome[];
    updated: IDecisionOutcome[];
    skipped: number;
    /** The plan after trimming, when the run applied. */
    plan: IPlanDocument;
}

/**
 * Create the entries a plan's decisions describe, and trim what was created.
 *
 * The decisions a plan takes are made *before* it is approved, and until they are entries nobody can
 * cite them: a comment says `@@D-860` and a comment is not the reasoning. Creating them here, from
 * the plan itself, is what puts the planning decisions on the same footing as the ones taken while
 * the work runs (@@D-861).
 *
 * Like the tasks, a detail that opens a heading is refused before anything is written, so a run
 * either converts the list or leaves the plan untouched.
 */
export async function createPlanDecisions(
    root: string,
    plan: IPlanDocument,
    options: {apply?: boolean; update?: boolean; area?: string; slug?: string; date?: string},
): Promise<ICreateDecisionsResult> {
    const slug = options.slug ?? plan.meta.slug ?? planSlug(plan.path);
    const issue = planIssue(plan);
    const created: IDecisionOutcome[] = [];
    const updated: IDecisionOutcome[] = [];
    const failures: string[] = [];
    const ids = new Map<IPlanDecision, string>();
    const links = new Map<IPlanDecision, string>();
    const entries = new Map(listEntries(root).map(entry => [entry.id, entry]));
    let skipped = 0;

    for (const decision of plan.decisions) {
        const detail = taskBodyText(decision);
        const heading = decision.body.find(line => /^#{1,6}\s/.test(line));
        if (heading) {
            failures.push(
                `line ${decision.line + 1}: "${decision.title}" contains a heading ` +
                    `("${heading.trim()}") — a memory entry holds prose, not sections`,
            );
            continue;
        }
        if (decision.id) {
            skipped += 1;
            const entry = entries.get(decision.id);
            if (entry) links.set(decision, entryLink(root, plan.path, entry));
            if (options.update && detail !== '') {
                if (options.apply) {
                    await replaceMemoryEntry(root, decision.id, {
                        title: decision.title,
                        body: taskEntryBody(slug, detail, issue),
                    });
                }
                updated.push({decision, id: decision.id});
            }
            continue;
        }
        const area = decision.area ?? options.area;
        if (!area) {
            failures.push(`line ${decision.line + 1}: "${decision.title}" names no area`);
            continue;
        }
        if (decision.title.length > MAX_TITLE_LENGTH) {
            failures.push(
                `line ${decision.line + 1}: the title is ${decision.title.length} characters; ` +
                    `keep it under ${MAX_TITLE_LENGTH}`,
            );
            continue;
        }
        if (!options.apply) {
            created.push({decision, id: '(new)'});
            continue;
        }
        const entry = await addMemoryEntry(root, {
            kind: 'decision',
            title: decision.title,
            area,
            body: taskEntryBody(slug, detail, issue),
            date: options.date,
        });
        ids.set(decision, entry.id);
        links.set(
            decision,
            entryLink(root, plan.path, {
                id: entry.id,
                title: decision.title,
                path: entry.path,
            }),
        );
        created.push({decision, id: entry.id, path: entry.path});
    }

    if (failures.length > 0) {
        throw new UsageError(
            `the plan's decisions cannot be created:\n${failures.map(line => `  ${line}`).join('\n')}`,
        );
    }

    if (!options.apply) return {created, updated, skipped, plan};

    const trimmed = trimDecisionsToLines(plan, ids, links);
    writeFileSync(trimmed.path, renderPlan(trimmed), 'utf8');
    return {created, updated, skipped, plan: trimmed};
}
