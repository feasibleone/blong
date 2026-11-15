/**
 * The canonical task layout of a plan, and the parser that reads it.
 *
 * A plan is prose with a work breakdown, and the work breakdown is the part a machine
 * has to read: `blong-dev plan tasks` turns each task into a memory todo, and
 * `blong-dev memory close` ticks its box. The layout is therefore a contract, and this
 * module is its only definition:
 *
 * ```markdown
 * - [ ] Scaffold the realm · area: realm/blong-agent
 *       Created with `kukum realm add …`.
 * ```
 *
 * The title line is a checkbox, the title, and a ` · area: <area>` suffix. Everything
 * below it that is blank or indented is the task's detail, dedented when it is read.
 * After `plan tasks` creates the entry the line keeps its checkbox and title and gains
 * the entry's id as a link:
 *
 * ```markdown
 * - [ ] [@@T-531](../../realm/blong-agent/.github/memory/todo.md#t-531--scaffold-the-realm) Scaffold the realm
 * ```
 *
 * The link is the navigation: it opens the entry in the editor, and the issue body the
 * plan is published as turns it into a github.com URL (`@@D-811`). A bare `@@T-531` is
 * still read, because a plan written before the link form, or an entry with no file to
 * point at, must not stop parsing.
 *
 * The detail is not lost — it moved into the memory entry, which is where it is
 * maintained from then on (`blong-dev memory edit @@T-531 --body-file …`).
 *
 * Optional YAML front matter at the top of the file carries what the tooling needs to
 * find the plan again: the slug, the GitHub issue, and the Slack conversation.
 */

import {readFileSync} from 'node:fs';

import {parse as parseYaml, stringify as stringifyYaml} from 'yaml';

/** A task line: `- [ ] Title · area: <area>`. */
const TASK = /^- \[(?<mark>[ xX])\]\s+(?<rest>.*)$/;

/**
 * The heading that opens the decisions the plan takes, inside `## 2. Technical approach`.
 *
 * A plan makes decisions before it is approved — which store, which layer, which default — and a
 * reader who has to reconstruct them from the prose cannot review the plan. Listing them here gives
 * them the shape the execution-time ones already have: one entry each, created when the plan is
 * published (@@D-861).
 */
const DECISIONS_HEADING = /^(?<hashes>#{2,4})\s+Decisions this plan takes\s*$/i;

/** A decision line: `- Title · area: <area>`, a plain bullet so the task parser ignores it. */
const DECISION = /^-\s+(?!\[[ xX]\]\s)(?<rest>.*)$/;

/**
 * The id a created task carries, bare or as the link to its memory entry.
 *
 * `@@T-531 Scaffold the realm` is what an older plan holds and what `plan adopt` writes
 * for an entry that has no file layout to point at; `[@@T-531](../../pkg/.github/memory/todo.md#t-531--…)
 * Scaffold the realm` is the form `plan tasks` writes, because a token a reader has to
 * search for is a worse table of contents than a link.
 */
const ID_PREFIX = /^\[?@@(?<id>[FTD]-\d{3})\]?(?:\((?<link>[^)]*)\))?\s+(?<title>.*)$/;

/** The area suffix, which is stripped from the title. */
const AREA_SUFFIX = /\s+·\s+area:\s*(?<area>\S.*?)\s*$/;

/**
 * A title that opens with where the task sits, not what it does.
 *
 * The title becomes a memory entry's title, and that entry is the thing a reader and a search have to
 * find it by. `Group 3 verification` says nothing a second plan's `Group 3 verification` does not say,
 * and the two entries are then indistinguishable (@@D-863).
 */
const POSITIONAL_PREFIX =
    /^(?:group|phase|step|stage|part|milestone)\s+(?:\d+|[ivx]+)\b[\s:—–,-]*(?<rest>.*)$/i;

/** The words that still say nothing once the position in front of them is removed. */
const GENERIC_AFTER_POSITION =
    /^(?:verification|verify|tests|test|testing|checks|check|docs|doc|documentation|review|wrap[- ]?up|final|misc|etc\.?)$/i;

/**
 * The reason a title names a position rather than the thing, or `undefined` when it names the thing.
 *
 * Exported because `plan check` reports it and its own tests pin the shapes: "Group 3 verification",
 * "Phase 2", a bare "Verification" — while "Group 2: the parser answers a bad type with 415" is a
 * title that survives removal from its plan.
 */
export function positionalTitle(title: string): string | undefined {
    const text = title.trim();
    const rest = (POSITIONAL_PREFIX.exec(text)?.groups?.['rest'] ?? text).trim();
    // `Group 4 tests and docs` is as positional as `Group 4 verification`: every part has to be one of
    // the words that say nothing, or the title names something after all.
    const parts = rest
        .toLowerCase()
        .split(/\s*(?:,|and|&|\+)\s*/)
        .map(part => part.trim())
        .filter(part => part !== '');
    if (parts.length > 0 && parts.every(part => GENERIC_AFTER_POSITION.test(part))) {
        return 'names a position in the plan, not the thing it checks';
    }
    if (parts.length === 0 && rest === '') {
        return 'names a position in the plan, not the thing it checks';
    }
    return undefined;
}

/** A fenced code block opener or closer. */
const FENCE = /^\s*(?:```|~~~)/;

/** The front-matter delimiter, only meaningful on the first line. */
const FRONT_MATTER = /^---\s*$/;

/** A heading, which ends a group and therefore a task's detail. */
const HEADING = /^#{1,6}\s/;

/** What the tooling records about a plan. */
export interface IPlanMeta {
    /** The folder under `plans/`, which is also the Slack channel's suffix. */
    slug?: string;
    title?: string;
    /** `draft`, `approved`, `active` or `done`. */
    status?: string;
    /** `owner/name` the issue lives in. */
    repo?: string;
    /** The issue number, once it exists. */
    issue?: number;
    issueUrl?: string;
    /** The platform account the channel was created with. */
    platform?: string;
    account?: string;
    /** The platform's name for the channel, e.g. `plan-agent`. */
    channelName?: string;
    /** The conversation id a `chat.prompt.ask` addresses: the Slack channel id. */
    conversationId?: string;
    /** Where a person opens that channel in a browser or the platform's app. */
    channelUrl?: string;
    created?: string;
    approved?: string;
    [key: string]: string | number | undefined;
}

/** One bullet of the work breakdown or the decisions list, as the plan states it. */
export interface IPlanItem {
    /** 0-based index of the line the item opens on. */
    line: number;
    /** 0-based index of the last line of the block, inclusive. */
    end: number;
    /** `T-531` / `D-861` once the item is created, absent before. */
    id?: string;
    /** The link the id was written as, when the plan uses the link form. */
    link?: string;
    /** The title, with the area suffix removed. */
    title: string;
    /** The area the memory entry belongs in, when the plan names one. */
    area?: string;
    /** Dedented detail lines; empty once the item has been created and trimmed. */
    body: string[];
}

/** One task as the plan states it. */
export interface IPlanTask extends IPlanItem {
    checked: boolean;
}

/**
 * One decision the plan takes.
 *
 * The plan's decisions are what the technical approach rests on. They become `D-` entries when the
 * plan is published, exactly as a task becomes a `T-`, because a decision a reader cannot follow to
 * its reasoning is a decision they have to take again (@@D-861).
 */
export type IPlanDecision = IPlanItem;

/** A plan, parsed. */
export interface IPlanDocument {
    path: string;
    lines: string[];
    meta: IPlanMeta;
    tasks: IPlanTask[];
    /** The decisions listed under `### Decisions this plan takes`; empty when there is none. */
    decisions: IPlanDecision[];
    /** Problems the parser found, each a sentence a reader can act on. */
    problems: string[];
}

/** The leading spaces of a line, with a tab counted as four. */
function indentOf(line: string): number {
    const match = /^[ \t]*/.exec(line);
    const prefix = match?.[0] ?? '';
    return prefix.split('').reduce((total, character) => total + (character === '\t' ? 4 : 1), 0);
}

/** Remove up to `count` leading spaces from a line. */
function dedent(line: string, count: number): string {
    let index = 0;
    let removed = 0;
    while (index < line.length && removed < count) {
        const character = line[index];
        if (character === ' ') {
            removed += 1;
            index += 1;
            continue;
        }
        if (character === '\t') {
            removed += 4;
            index += 1;
            continue;
        }
        break;
    }
    return line.slice(index);
}

/** The front-matter block, its metadata, and where the body starts. */
function readFrontMatter(lines: readonly string[]): {
    meta: IPlanMeta;
    start: number;
    end: number;
    problem?: string;
} {
    if (lines.length === 0 || !FRONT_MATTER.test(lines[0] ?? '')) {
        return {meta: {}, start: 0, end: -1};
    }
    const close = lines.findIndex((line, index) => index > 0 && FRONT_MATTER.test(line));
    if (close === -1) {
        return {
            meta: {},
            start: 0,
            end: -1,
            problem: 'the front matter opens with `---` and never closes',
        };
    }
    const text = lines.slice(1, close).join('\n');
    try {
        const parsed = parseYaml(text) as unknown;
        const meta = parsed !== null && typeof parsed === 'object' ? (parsed as IPlanMeta) : {};
        return {meta, start: 0, end: close};
    } catch (error) {
        return {
            meta: {},
            start: 0,
            end: close,
            problem: `the front matter is not valid YAML: ${String(error)}`,
        };
    }
}

/** Split a task line into its parts. */
export function parseTaskLine(rest: string): {
    id?: string;
    link?: string;
    title: string;
    area?: string;
} {
    let text = rest.trim();
    let id: string | undefined;
    let link: string | undefined;
    const withId = ID_PREFIX.exec(text);
    if (withId) {
        id = withId.groups?.['id'];
        link = withId.groups?.['link'];
        text = (withId.groups?.['title'] ?? '').trim();
    }
    let area: string | undefined;
    const withArea = AREA_SUFFIX.exec(text);
    if (withArea) {
        area = withArea.groups?.['area']?.trim();
        text = text.slice(0, withArea.index).trim();
    }
    return {id, link, title: text, area};
}

/** Read a plan from disk. */
export function readPlan(path: string): IPlanDocument {
    return parsePlan(readFileSync(path, 'utf8'), path);
}

/**
 * Parse plan text.
 *
 * The parser is deliberately forgiving about what a plan's prose looks like and strict
 * about the task line: a checkbox that opens a task must carry a title, and a task that
 * has no id yet must name an area somewhere (the line, or `defaultArea`).
 */
export function parsePlan(text: string, path = '', defaultArea?: string): IPlanDocument {
    const lines = text.replace(/\r\n/g, '\n').split('\n');
    if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
    const problems: string[] = [];
    const front = readFrontMatter(lines);
    if (front.problem) problems.push(front.problem);

    const tasks: IPlanTask[] = [];
    let fence = false;
    for (let index = front.end + 1; index < lines.length; index += 1) {
        const line = lines[index] ?? '';
        if (FENCE.test(line)) {
            fence = !fence;
            continue;
        }
        if (fence) continue;
        const match = TASK.exec(line);
        if (!match) continue;
        const parsed = parseTaskLine(match.groups?.['rest'] ?? '');
        const checked = (match.groups?.['mark'] ?? ' ').toLowerCase() === 'x';
        if (!parsed.title) {
            problems.push(`line ${index + 1}: a task has no title`);
            continue;
        }

        // The detail is every following line that is blank or indented; the first
        // line at the margin ends the task, which is what makes a group's own
        // `- **Verification**` note belong to the group and not to the last task.
        let end = index;
        let scan = index + 1;
        let innerFence = false;
        while (scan < lines.length) {
            const next = lines[scan] ?? '';
            if (FENCE.test(next)) {
                innerFence = !innerFence;
                end = scan;
                scan += 1;
                continue;
            }
            if (!innerFence && next.trim() !== '' && !/^[ \t]/.test(next)) break;
            if (!innerFence && HEADING.test(next)) break;
            end = scan;
            scan += 1;
        }

        const raw = lines.slice(index + 1, end + 1);
        while (raw.length > 0 && (raw[raw.length - 1] ?? '').trim() === '') raw.pop();
        const indents = raw.filter(line => line.trim() !== '').map(indentOf);
        const dedentBy = indents.length > 0 ? Math.min(...indents) : 0;
        const body = raw.map(line => dedent(line, dedentBy)).map(line => line.trimEnd());

        tasks.push({
            line: index,
            end,
            checked,
            id: parsed.id,
            link: parsed.link,
            title: parsed.title,
            area: parsed.area ?? defaultArea,
            body,
        });
        index = end;
    }

    for (const task of tasks) {
        if (task.checked && !task.id) {
            problems.push(
                `line ${task.line + 1}: a checked task has no @@T- id, so nothing tracks it`,
            );
        }
        if (!task.checked && !task.id && !task.area) {
            problems.push(
                `line ${task.line + 1}: task "${task.title}" names no area ` +
                    '(write ` · area: <package>` or pass --area)',
            );
        }
    }

    const seen = new Map<string, number>();
    for (const task of tasks) {
        const key = task.title.toLowerCase();
        const first = seen.get(key);
        if (first !== undefined) {
            problems.push(
                `line ${task.line + 1}: "${task.title}" repeats the title on line ${first + 1}`,
            );
        } else {
            seen.set(key, task.line);
        }
    }

    const decisions = parseDecisions(lines);
    const decisionTitles = new Map<string, number>();
    for (const decision of decisions) {
        if (!decision.title) {
            problems.push(`line ${decision.line + 1}: a decision has no title`);
            continue;
        }
        if (!decision.id && !decision.area) {
            problems.push(
                `line ${decision.line + 1}: decision "${decision.title}" names no area ` +
                    '(write ` · area: <package>`)',
            );
        }
        const first = decisionTitles.get(decision.title.toLowerCase());
        if (first !== undefined) {
            problems.push(
                `line ${decision.line + 1}: decision "${decision.title}" repeats the one on ` +
                    `line ${first + 1} — one decision is one entry`,
            );
        } else {
            decisionTitles.set(decision.title.toLowerCase(), decision.line);
        }
    }

    return {path, lines, meta: front.meta, tasks, decisions, problems};
}

/**
 * Read the `### Decisions this plan takes` list.
 *
 * The list opens at that heading, inside `## 2. Technical approach`, and ends at the next heading of
 * the same or a higher level — so a plan with no such heading has no decisions and parses as it
 * always did. A bullet at the margin opens one decision; an empty title is reported by the caller,
 * so the block still ends where a reader sees it end.
 */
function parseDecisions(lines: readonly string[]): IPlanDecision[] {
    const start = lines.findIndex(line => DECISIONS_HEADING.test(line));
    if (start === -1) return [];
    const level = (DECISIONS_HEADING.exec(lines[start] ?? '')?.groups?.['hashes'] ?? '###').length;
    let end = lines.length;
    let fence = false;
    for (let index = start + 1; index < lines.length; index += 1) {
        const line = lines[index] ?? '';
        if (FENCE.test(line)) fence = !fence;
        if (fence) continue;
        const heading = /^(#{1,6})\s/.exec(line);
        if (heading && (heading[1]?.length ?? 0) <= level) {
            end = index;
            break;
        }
    }

    const decisions: IPlanDecision[] = [];
    for (let index = start + 1; index < end; index += 1) {
        const match = DECISION.exec(lines[index] ?? '');
        if (!match) continue;
        const parsed = parseTaskLine(match.groups?.['rest'] ?? '');
        // The detail is every following line that is blank or indented; the first line at the
        // margin ends the decision, which is what lets a paragraph after the list be prose.
        let last = index;
        let scan = index + 1;
        let innerFence = false;
        while (scan < end) {
            const next = lines[scan] ?? '';
            if (FENCE.test(next)) {
                innerFence = !innerFence;
                last = scan;
                scan += 1;
                continue;
            }
            if (!innerFence && next.trim() !== '' && !/^[ \t]/.test(next)) break;
            last = scan;
            scan += 1;
        }
        const raw = lines.slice(index + 1, last + 1);
        while (raw.length > 0 && (raw[raw.length - 1] ?? '').trim() === '') raw.pop();
        const indents = raw.filter(line => line.trim() !== '').map(indentOf);
        const dedentBy = indents.length > 0 ? Math.min(...indents) : 0;
        decisions.push({
            line: index,
            end: last,
            id: parsed.id,
            link: parsed.link,
            title: parsed.title,
            area: parsed.area,
            body: raw.map(line => dedent(line, dedentBy)).map(line => line.trimEnd()),
        });
        index = last;
    }
    return decisions;
}

/**
 * The line a created task carries: `- [ ] [@@T-531](link) Title`, or the bare token when
 * the task has no link yet.
 */
export function renderTaskLine(
    task: Pick<IPlanTask, 'checked' | 'id' | 'title'>,
    link?: string,
): string {
    const reference = task.id ? (link ? `[@@${task.id}](${link})` : `@@${task.id}`) : '';
    return `- [${task.checked ? 'x' : ' '}] ${reference ? `${reference} ` : ''}${task.title}`;
}

/**
 * The line a created decision carries: `- [@@D-861](link) Title`.
 *
 * No checkbox and no area suffix, for the same reason a created task has none: the entry holds the
 * area and the work, and the line is what a reader clicks.
 */
export function renderDecisionLine(
    decision: Pick<IPlanDecision, 'id' | 'title'>,
    link?: string,
): string {
    const reference = decision.id
        ? link
            ? `[@@${decision.id}](${link})`
            : `@@${decision.id}`
        : '';
    return `- ${reference ? `${reference} ` : ''}${decision.title}`;
}

/** The detail lines of a task as one body string, for a memory entry. */
export function taskBodyText(task: IPlanItem): string {
    return task.body.join('\n').trim();
}

/**
 * Replace every item block with its one-line form, in place.
 *
 * The edits happen from the bottom up because replacing a block of ten lines with one
 * moves every line below it; walking forwards would invalidate the indexes the parser
 * produced. An item whose one-line form is already what it would be written as is left
 * byte-for-byte.
 *
 * Tasks and decisions are trimmed by the same code because the shape is the same: a line that names
 * an entry, and a detail block that has moved into it.
 */
function trimItems<T extends IPlanItem>(
    doc: IPlanDocument,
    items: readonly T[],
    ids: ReadonlyMap<T, string>,
    links: ReadonlyMap<T, string> | undefined,
    render: (item: T, id: string, link: string | undefined) => string,
): IPlanDocument {
    const lines = [...doc.lines];
    const sorted = [...items].sort((a, b) => b.line - a.line);
    for (const item of sorted) {
        const id = ids.get(item) ?? item.id;
        if (!id) continue;
        const line = render(item, id, links?.get(item) ?? item.link);
        if (item.body.length === 0 && lines[item.line] === line) continue;
        // The detail block ends with the blank line that separated it from what follows, so
        // replacing it with one line would glue the next heading to the item above it. The block's
        // own trailing blank is kept — which is also what keeps a heading where a reader expects
        // it, since `plan check` accepts either shape.
        const block = lines.slice(item.line, item.end + 1);
        const endedBlank = block.length > 1 && (block[block.length - 1] ?? '').trim() === '';
        const next = lines[item.end + 1];
        const followedByHeading = next !== undefined && /^#{1,6}\s/.test(next);
        lines.splice(
            item.line,
            item.end - item.line + 1,
            ...(endedBlank || followedByHeading ? [line, ''] : [line]),
        );
    }
    return {...doc, lines: collapseBlankRuns(spaceOutHeadings(lines))};
}

/** Replace every task block with its one-line form, in place. */
export function trimTasksToLines(
    doc: IPlanDocument,
    ids: ReadonlyMap<IPlanTask, string>,
    links?: ReadonlyMap<IPlanTask, string>,
): IPlanDocument {
    return trimItems(doc, doc.tasks, ids, links, (task, id, link) =>
        renderTaskLine({...task, id}, link),
    );
}

/** Replace every decision block with its one-line form, in place. */
export function trimDecisionsToLines(
    doc: IPlanDocument,
    ids: ReadonlyMap<IPlanDecision, string>,
    links?: ReadonlyMap<IPlanDecision, string>,
): IPlanDocument {
    return trimItems(doc, doc.decisions, ids, links, (decision, id, link) =>
        renderDecisionLine({...decision, id}, link),
    );
}

/**
 * One blank line above every heading, outside fenced code.
 *
 * A trimmed block takes the blank that separated it from the heading below, so a plan trimmed once
 * has its group headings glued to the task above them. Fixing it here rather than only where the
 * block is replaced also repairs a plan that was trimmed before this rule existed — the second
 * `plan tasks` finds every line already in its one-line form and would otherwise change nothing.
 */
function spaceOutHeadings(lines: readonly string[]): string[] {
    const out: string[] = [];
    let inFence = false;
    for (const line of lines) {
        const fence = /^\s*(?:```|~~~)/.test(line);
        if (
            !fence &&
            !inFence &&
            /^#{1,6}\s/.test(line) &&
            (out[out.length - 1] ?? '').trim() !== ''
        )
            out.push('');
        out.push(line);
        if (fence) inFence = !inFence;
    }
    return out;
}

/**
 * One blank line where there were several, outside fenced code.
 *
 * Trimming keeps a block's trailing blank, and the file may already have had one; collapsing them
 * here is what stops a second `plan tasks` from growing a run of blanks between two groups.
 */
function collapseBlankRuns(lines: readonly string[]): string[] {
    const out: string[] = [];
    let inFence = false;
    for (const line of lines) {
        const fence = /^\s*(?:```|~~~)/.test(line);
        if (!fence && !inFence && line.trim() === '' && (out[out.length - 1] ?? '').trim() === '')
            continue;
        out.push(line);
        if (fence) inFence = !inFence;
    }
    return out;
}

/** Rewrite a plan's front matter, merging over what is there. */
export function writeMeta(doc: IPlanDocument, patch: IPlanMeta): IPlanDocument {
    const meta: IPlanMeta = {...doc.meta, ...patch};
    const end = frontMatterEnd(doc.lines);
    const body = doc.lines.slice(end + 1);
    const text = stringifyYaml(meta, {lineWidth: 100}).trimEnd().split('\n');
    const lines = ['---', ...text, '---', ...body];
    return {...doc, lines, meta};
}

/** The index of the closing `---`, or `-1`. */
function frontMatterEnd(lines: readonly string[]): number {
    if (lines.length === 0 || !FRONT_MATTER.test(lines[0] ?? '')) return -1;
    return lines.findIndex((line, index) => index > 0 && FRONT_MATTER.test(line));
}

/** The plan's markdown, with front matter included. */
export function renderPlan(doc: IPlanDocument): string {
    return `${doc.lines.join('\n')}\n`;
}

/** The title a plan declares, falling back to its H1. */
export function planTitle(doc: IPlanDocument): string {
    if (doc.meta.title) return doc.meta.title;
    const heading = doc.lines.find(line => /^#\s+/.test(line));
    return heading ? heading.replace(/^#\s+/, '').trim() : '';
}

/** The marker that strips a plan's front matter before it is published. */
export function bodyWithoutFrontMatter(doc: IPlanDocument): string {
    const end = frontMatterEnd(doc.lines);
    return `${doc.lines
        .slice(end + 1)
        .join('\n')
        .replace(/^\n+/, '')}\n`;
}
