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
 *
 *     Created with `kukum realm add …`.
 * ```
 *
 * The title line is a checkbox, the title, and a ` · area: <area>` suffix, and the detail is a
 * paragraph indented four spaces below a blank line — the shape a markdown formatter leaves alone,
 * where a lazy continuation would be re-flowed into the title and a `- verify:` glued to the prose
 * above it. A title the formatter wraps is still one line: `readWrappedTitle` joins it back.
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
const ID_PREFIX = /^\[?@@(?<id>[FTD]-\d{3,})\]?(?:\((?<link>[^)]*)\))?\s+(?<title>.*)$/;

/**
 * A created item whose whole text is the link: `[@@T-531 Scaffold the realm](…/todo.md#t-531--…)`.
 *
 * This is the shape a published plan uses, because it is the only one a reader's eye takes in at a
 * glance: the checkbox, then one link whose text *is* the task. The title used to sit beside or under
 * the link, and both put it outside the link — beside it made the line wrap into a second paragraph in
 * the published issue, under it made it look like a subtitle (`@@F-768`). Inside the brackets there is
 * nothing left to wrap: GitHub wraps the link's text, which is one paragraph however long it is.
 */
const LINKED_TITLE =
    /^\[@@(?<id>[FTD]-\d{3,})\s+(?<title>[^\]]*)\]\((?<link>[^)]*)\)\s*(?<rest>.*)$/;

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
    /** The host that holds the plan, and since when — see `planOwnership.ts`. */
    claimed?: string;
    claimedAt?: string;
    claimedBy?: string;
    /** The day the local `plan.md` was removed, when the plan was released from its folder. */
    localRemovedAt?: string;
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
    const inside = LINKED_TITLE.exec(text);
    const withId = inside ?? ID_PREFIX.exec(text);
    if (withId) {
        id = withId.groups?.['id'];
        link = withId.groups?.['link'];
        text = (withId.groups?.['title'] ?? '').trim();
        // Text after the closing bracket of a linked title is a residue of an older render; it is
        // joined so a half-converted line still reads as one title.
        const rest = (withId.groups?.['rest'] ?? '').trim();
        if (inside && rest !== '') text = `${text} ${rest}`.trim();
    }
    let area: string | undefined;
    const withArea = AREA_SUFFIX.exec(text);
    if (withArea) {
        area = withArea.groups?.['area']?.trim();
        text = text.slice(0, withArea.index).trim();
    }
    return {id, link, title: text, area};
}

/** How many lines a wrapped title may occupy in total, so a stray block is not read as one. */
const MAX_TITLE_LINES = 3;

/**
 * Read a title a formatter wrapped onto the lines below it.
 *
 * The task line is the parser's contract, but a markdown formatter re-wraps a line wider than its
 * print width at a space — and this repository's prettier config sets `proseWrap: always`, so a long
 * title, or just a ` · area:` whose value will not fit, continues on the next line indented to the
 * marker:
 *
 * ```markdown
 * - [ ] Re-point identity at the new store · area:
 *       core/blong-gogo
 * ```
 *
 * That is one logical line and the parser has to read it as one, or a formatter silently robs every
 * long title of its area. The blank line the format requires before the detail is what separates the
 * two: every indented line up to the first blank belongs to the title, and joining stops as soon as
 * the text carries an area, so a task that genuinely names none keeps the detail where it was and is
 * reported as before.
 */
function readWrappedTitle(
    lines: readonly string[],
    index: number,
    rest: string,
    limit: number,
): {parsed: ReturnType<typeof parseTaskLine>; extra: number} {
    const first = parseTaskLine(rest);
    const marker = /·\s*(?:area:\s*)?$/.test(rest.trim());
    // A line that is only the entry's link: the title was pushed entirely onto the next line because
    // the link is wider than the print width.
    const bareId = /^\[?@@[FTD]-\d{3,}\]?(\([^)]*\))?\s*$/.test(rest.trim());
    // Joining is for three shapes and no more: a line whose ` · area:` value wrapped, a line that
    // carries its id and whose title wrapped, and a line that is only the link. A task that names no
    // area at all has none of those markers, keeps its detail where it was, and is still reported.
    if (first.area !== undefined || !(first.id !== undefined || marker || bareId)) {
        return {parsed: first, extra: 0};
    }
    const words = [rest.trim()];
    for (let scan = index + 1; scan < limit && words.length < MAX_TITLE_LINES; scan += 1) {
        const next = lines[scan] ?? '';
        if (next.trim() === '' || !/^[ \t]/.test(next) || FENCE.test(next)) break;
        // A line that repeats part of the title the line above already carries is not a continuation
        // of it: an earlier render can leave one behind, and joining it would double the title.
        if (first.title !== '' && first.title.endsWith(next.trim())) break;
        words.push(next.trim());
        const parsed = parseTaskLine(words.join(' '));
        // The joined line is taken when it recovered something the break took away: the area, the
        // id-and-title structure of a line that was only a link, or a longer title than the break
        // left behind.
        if (
            parsed.area !== undefined ||
            (parsed.id !== undefined && first.id === undefined) ||
            parsed.title.length > first.title.length
        ) {
            return {parsed, extra: words.length - 1};
        }
    }
    return {parsed: first, extra: 0};
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
        const {parsed, extra} = readWrappedTitle(
            lines,
            index,
            match.groups?.['rest'] ?? '',
            lines.length,
        );
        const checked = (match.groups?.['mark'] ?? ' ').toLowerCase() === 'x';
        if (!parsed.title) {
            problems.push(`line ${index + 1}: a task has no title`);
            continue;
        }

        // The detail is every following line that is blank or indented; the first
        // line at the margin ends the task, which is what makes a group's own
        // `- **Verification**` note belong to the group and not to the last task.
        let end = index + extra;
        let scan = index + extra + 1;
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

        const raw = lines.slice(index + extra + 1, end + 1);
        while (raw.length > 0 && (raw[0] ?? '').trim() === '') raw.shift();
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
        const {parsed, extra} = readWrappedTitle(lines, index, match.groups?.['rest'] ?? '', end);
        // The detail is every following line that is blank or indented; the first line at the
        // margin ends the decision, which is what lets a paragraph after the list be prose.
        let last = index + extra;
        let scan = index + extra + 1;
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
        const raw = lines.slice(index + extra + 1, last + 1);
        while (raw.length > 0 && (raw[0] ?? '').trim() === '') raw.shift();
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
    const reference = task.id
        ? link
            ? `[@@${task.id} ${task.title}](${link})`
            : `@@${task.id}`
        : '';
    // A linked task's text is the link itself; an unlinked one keeps the title beside its token, and a
    // task with no id at all is still the draft line a reviewer edits.
    const text = task.id && link ? '' : ` ${task.title}`;
    return `- [${task.checked ? 'x' : ' '}] ${reference}${text}`.trimEnd();
}

/**
 * The indentation a title takes on the line after its bullet.
 *
 * Six spaces puts it inside the item's content, and a continuation rather than a nested block: the
 * bullet is `- [ ] ` (six characters), so the line reads as the same list item in GitHub and in a
 * terminal, and a reader sees the id first and the title under it.
 */
const TITLE_INDENT = '      ';

/**
 * A created task as it is written into the plan: the link line, then the title under it.
 *
 * The two-line form exists because a link is long. `- [ ] [@@T-531](../../pkg/.memory/todo.md#t-531--…)
 * Scaffold the realm` is a hundred characters before the title starts, so the line wraps wherever the
 * formatter decides, and every later render has to decide whether the line under it is the rest of
 * the title or a leftover from a previous one — which is how a title ends up written two and three
 * times (a render appended the title under a line that already carried it, the parser read the two as
 * one, and the next render wrote it again). Putting the title on its own line is the shape neither
 * step can get wrong: `readWrappedTitle` already joins a bare-link line with its continuation
 * (@@F-768).
 *
 * A task without a link keeps the one-line draft form, so a plan that has not been published still
 * reads as prose a reviewer can edit.
 */
export function renderTaskBlock(
    task: Pick<IPlanTask, 'checked' | 'id' | 'title'>,
    link?: string,
): string[] {
    return [renderTaskLine(task, link)];
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
            ? `[@@${decision.id} ${decision.title}](${link})`
            : `@@${decision.id}`
        : '';
    const text = decision.id && link ? '' : ` ${decision.title}`;
    return `- ${reference}${text}`.trimEnd();
}

/** A created decision as it is written into the plan: the link line, then the title under it. */
export function renderDecisionBlock(
    decision: Pick<IPlanDecision, 'id' | 'title'>,
    link?: string,
): string[] {
    return [renderDecisionLine(decision, link)];
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
    render: (item: T, id: string, link: string | undefined) => string[],
): IPlanDocument {
    const lines = [...doc.lines];
    const sorted = [...items].sort((a, b) => b.line - a.line);
    for (const item of sorted) {
        const id = ids.get(item) ?? item.id;
        if (!id) continue;
        const rendered = render(item, id, links?.get(item) ?? item.link);
        // Already in the form it would be written as — in either shape the formatter may leave it
        // in — and with no detail left over: nothing to do.
        if (
            item.body.length === 0 &&
            blockIsRendered(lines.slice(item.line, item.end + 1), rendered)
        ) {
            continue;
        }
        // The whole block goes, not only its first line: an earlier render can leave a repetition of
        // the title under the line, and replacing the first line alone would keep it forever
        // (@@F-768).
        lines.splice(
            item.line,
            item.end - item.line + 1,
            ...rendered,
            // A blank line is a heading's, not an item's: consecutive items stay tight so the
            // breakdown renders as one list rather than one paragraph per task.
            ...(isHeading(lines[item.end + 1]) ? [''] : []),
        );
    }
    return {...doc, lines: spaceOutPlan(lines)};
}

/**
 * Whether a block already says exactly what would be written for it.
 *
 * The comparison is line by line, not by content: a block that was wrapped into two lines by an
 * earlier format or by an earlier render says the same words but is not the shape the tooling
 * writes, and the trim exists to put it back (@@F-768 @@D-919). Comparing content instead would
 * accept the wrapped form forever and leave the board reading one task as two.
 */
export function blockIsRendered(block: readonly string[], rendered: readonly string[]): boolean {
    if (block.length !== rendered.length) return false;
    return rendered.every((line, index) => (block[index] ?? '').trimEnd() === line.trimEnd());
}

/** Whether a line is a markdown heading (or the end of the document, which needs no blank). */
function isHeading(line: string | undefined): boolean {
    return line !== undefined && /^#{1,6}\s/.test(line);
}

/** Replace every task block with its one-line form, in place. */
export function trimTasksToLines(
    doc: IPlanDocument,
    ids: ReadonlyMap<IPlanTask, string>,
    links?: ReadonlyMap<IPlanTask, string>,
): IPlanDocument {
    return trimItems(doc, doc.tasks, ids, links, (task, id, link) =>
        renderTaskBlock({...task, id}, link),
    );
}

/** Replace every decision block with its one-line form, in place. */
export function trimDecisionsToLines(
    doc: IPlanDocument,
    ids: ReadonlyMap<IPlanDecision, string>,
    links?: ReadonlyMap<IPlanDecision, string>,
): IPlanDocument {
    return trimItems(doc, doc.decisions, ids, links, (decision, id, link) =>
        renderDecisionBlock({...decision, id}, link),
    );
}

/**
 * The spacing a plan's text keeps after an edit: one blank line above every heading, no run of blanks
 * anywhere else, and a formatter guard above every list of items.
 *
 * Exported because `plan sync` edits the same text and must leave the same shape — a sync that only
 * rewrites item lines leaves a heading glued to the task above it, which is a different rendering in
 * the issue than in the file (@@F-768).
 */
export function spaceOutPlan(lines: readonly string[]): string[] {
    return collapseBlankRuns(spaceOutHeadings(guardLists(lines)));
}

/** The comment that keeps the markdown formatter's hands off the list below it. */
export const LIST_GUARD = '<!-- prettier-ignore -->';

/**
 * A `<!-- prettier-ignore -->` above every list of items, and nowhere else.
 *
 * A plan is formatted like any other markdown page — the headings, the prose and the tables are the
 * formatter's — but a work-breakdown line is a *record*: the tooling writes it, `plan check` compares
 * it and the issue is published from it, so a formatter that re-wraps a long title into a second line
 * changes how the board reads. The guard is what separates the two: one comment, written here rather
 * than by hand, so the list below it is left exactly as the tooling wrote it (@@D-919).
 *
 * The comment is attached to the first line of the list and not separated from it by a blank, because
 * `prettier-ignore` applies to the node that follows it — a list is one node, so one comment is enough
 * for every item in it.
 */
function guardLists(lines: readonly string[]): string[] {
    const out: string[] = [];
    let inFence = false;
    let guarded = false;
    for (const line of lines) {
        const fence = /^\s*(?:```|~~~)/.test(line);
        if (fence) inFence = !inFence;
        const item = !inFence && /^- (?:\[[ xX]\] )?\[?@@[FTD]-\d{3,}/.test(line);
        if (item && !guarded && out[out.length - 1] !== LIST_GUARD) out.push(LIST_GUARD);
        if (item) guarded = true;
        else if (line.trim() !== '' && !line.startsWith(' ')) guarded = false;
        out.push(line);
    }
    return out;
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

/**
 * Rewrite a plan's front matter, merging over what is there.
 *
 * `clear` names keys to drop rather than set: a claim is released by the absence of `claimed`,
 * not by an empty string, so a release deletes the three fields the claim wrote.
 */
export function writeMeta(
    doc: IPlanDocument,
    patch: IPlanMeta,
    clear: readonly string[] = [],
): IPlanDocument {
    const merged: IPlanMeta = {...doc.meta, ...patch};
    for (const key of clear) delete merged[key];
    const meta: IPlanMeta = merged;
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

/** The front matter as the document holds it, without the `---` fences; empty when it has none. */
export function frontMatterText(doc: IPlanDocument): string {
    const end = frontMatterEnd(doc.lines);
    return end < 0 ? '' : doc.lines.slice(1, end).join('\n');
}

/**
 * The front matter a published issue carries: every key except the named ones.
 *
 * The lines are copied rather than re-serialised, so a folded `summary` keeps the shape its author
 * gave it, and a key's indented continuation lines travel with the key (@@T-760).
 */
export function frontMatterWithout(doc: IPlanDocument, keys: readonly string[]): string {
    const skip = new Set(keys);
    const kept: string[] = [];
    let dropping = false;
    for (const line of frontMatterText(doc).split('\n')) {
        const key = /^([A-Za-z][A-Za-z0-9_-]*):/.exec(line)?.[1];
        if (key !== undefined) dropping = skip.has(key);
        if (!dropping) kept.push(line);
    }
    return kept.join('\n').trim();
}

/** A plan's text, from its front matter and its body. */
export function planText(meta: IPlanMeta, body: string): string {
    const text = stringifyYaml(meta, {lineWidth: 100}).trimEnd().split('\n');
    return ['---', ...text, '---', '', body.trimEnd(), ''].join('\n');
}
