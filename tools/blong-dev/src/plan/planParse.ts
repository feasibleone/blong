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

/** One task as the plan states it. */
export interface IPlanTask {
    /** 0-based index of the task line. */
    line: number;
    /** 0-based index of the last line of the block, inclusive. */
    end: number;
    checked: boolean;
    /** `T-531` once the task is created, absent before. */
    id?: string;
    /** The link the id was written as, when the plan uses the link form. */
    link?: string;
    /** The title, with the area suffix removed. */
    title: string;
    /** The area the memory entry belongs in, when the plan names one. */
    area?: string;
    /** Dedented detail lines; empty once the task has been created and trimmed. */
    body: string[];
}

/** A plan, parsed. */
export interface IPlanDocument {
    path: string;
    lines: string[];
    meta: IPlanMeta;
    tasks: IPlanTask[];
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

    return {path, lines, meta: front.meta, tasks, problems};
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

/** The detail lines of a task as one body string, for a memory entry. */
export function taskBodyText(task: IPlanTask): string {
    return task.body.join('\n').trim();
}

/**
 * Replace every task block with its one-line form, in place.
 *
 * The edits happen from the bottom up because replacing a block of ten lines with one
 * moves every line below it; walking forwards would invalidate the indexes the parser
 * produced. A task whose one-line form is already what it would be written as is left
 * byte-for-byte.
 */
export function trimTasksToLines(
    doc: IPlanDocument,
    ids: ReadonlyMap<IPlanTask, string>,
    links?: ReadonlyMap<IPlanTask, string>,
): IPlanDocument {
    const lines = [...doc.lines];
    const tasks = [...doc.tasks].sort((a, b) => b.line - a.line);
    for (const task of tasks) {
        const id = ids.get(task) ?? task.id;
        if (!id) continue;
        const line = renderTaskLine({...task, id}, links?.get(task) ?? task.link);
        if (task.body.length === 0 && lines[task.line] === line) continue;
        lines.splice(task.line, task.end - task.line + 1, line);
    }
    return {...doc, lines};
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
