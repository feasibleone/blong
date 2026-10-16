/**
 * The readable reason inside a raw TAP stream.
 *
 * `tap.raw.tap` is tap's own view of a run — the `ok`/`not ok` tree with its `# Subtest:`
 * nesting — and for some failures it is the only place the reason exists. A file whose
 * budget expired is recorded in `tap.json` as a suite that failed with a synthesised
 * `timeout!` child, and a file tap *killed* leaves its failures out of that report
 * altogether; the stream still carries the `not ok … - timeout!` line, the `expired:` name
 * and the coverage gates that failed with it (@@F-539).
 *
 * The excerpt is deliberately small: the failing line, the assertions before it (what the
 * test had already proved when it ran out of budget) and the diagnostics after it, with
 * tap's handle dump collapsed to a count — it runs to hundreds of lines of socket
 * bookkeeping and says nothing the type breakdown does not.
 */

/** File inside a package's `.ci-report/` holding the full TAP stream of the last run. */
export const RAW_TAP_FILE = 'tap.raw.tap';

export interface IExcerptOptions {
    /** Lines kept before the failing one, where the last passing assertions are. */
    before?: number;
    /** Lines kept after it, where the diagnostics are. */
    after?: number;
    /** Longest line kept; a single tap diagnostic can run to thousands of characters. */
    maxLineLength?: number;
}

const DEFAULTS = {before: 10, after: 12, maxLineLength: 160} as const;

/** A TAP failure line, in the form `not ok 3 - name`. */
const NOT_OK = /^\s*not ok \d+ - (.*)$/;

/** Leading indentation of a line, tabs counted as one column. */
function indentOf(line: string): number {
    return line.length - line.trimStart().length;
}

/** The test name a `not ok` line reports, or `undefined` for any other line. */
function failingName(line: string): string | undefined {
    return NOT_OK.exec(line)?.[1]?.trim();
}

/**
 * The line of the `not ok` entry that belongs to `name`.
 *
 * Matched from the most specific form to the least, because one failing test appears twice
 * in a stream: the synthesised `timeout!` case *and* the group whose budget expired. A
 * name the stream does not carry falls back to the last failure in it, which is what a
 * file-level expiry looks like — tap writes its report before its own verdict, so a killed
 * file has no named entry at all.
 */
function locate(lines: readonly string[], name: string): number | undefined {
    const failures = lines
        .map((line, index) => ({name: failingName(line), index}))
        .filter((entry): entry is {name: string; index: number} => entry.name !== undefined);
    if (failures.length === 0) return undefined;

    const segments = name
        .split('›')
        .map(segment => segment.trim())
        .filter(segment => segment !== '');
    const last = segments.at(-1) ?? name;
    const groups = segments.slice(0, -1);
    const matchers = [
        (text: string) => text === last,
        (text: string) => text.endsWith(last),
        (text: string) => groups.some(group => text === group),
        (text: string) => groups.some(group => text.includes(group)),
    ];
    for (const matches of matchers) {
        const hit = failures.find(entry => matches(entry.name));
        if (hit) return hit.index;
    }
    return failures.at(-1)?.index;
}

/**
 * Replace tap's handle dump with a count of what it listed.
 *
 * The dump is a YAML block under `handles:` — one entry per open server, socket and child
 * process, at least three lines each, and around ninety lines in the timeout that motivated
 * this module — and it is the longest part of a timeout's diagnostics. The count keeps the
 * one thing that reads as a cause, and collapsing it *before* the failing line is located
 * and the window is chosen is what keeps what follows it (the `expired:` name, the run's
 * totals) inside the excerpt.
 */
function collapseHandles(lines: readonly string[]): string[] {
    const kept: string[] = [];
    for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index]!;
        if (line.trim() !== 'handles:') {
            kept.push(line);
            continue;
        }
        const indent = indentOf(line);
        let entries = 0;
        let next = index + 1;
        for (; next < lines.length; next += 1) {
            const candidate = lines[next]!;
            if (candidate.trim() === '' || indentOf(candidate) <= indent) break;
            // One entry per `- type:`, not per list item: the `events:` list under each is
            // three to six lines of its own and would treble the count.
            if (/^\s*-\s+type:/.test(candidate)) entries += 1;
        }
        kept.push(line);
        kept.push(`${' '.repeat(indent + 2)}… ${entries} open handle(s) dropped`);
        index = next - 1;
    }
    return kept;
}

/**
 * Shift the excerpt so the failing line starts at column zero.
 *
 * The nesting above it is clipped rather than indented negative, which keeps the relative
 * depth of the diagnostics below it (where the reason is) while putting the line the reader
 * came for at the left edge.
 */
function rebase(lines: readonly string[], indent: number): string[] {
    if (indent === 0) return [...lines];
    return lines.map(line =>
        line.trim() === '' || indentOf(line) <= indent ? line.trimStart() : line.slice(indent),
    );
}

/** Cut a line to `max` characters, marking that it was cut. */
function truncate(line: string, max: number): string {
    return line.length <= max ? line : `${line.slice(0, max - 1)}…`;
}

/**
 * The excerpt around the failure named by `name`, or `undefined` when the stream is empty.
 *
 * `name` is the report's own name for the test (`group › test`), which the stream records
 * as the innermost `not ok` line, so the group path is what the fallbacks match on.
 */
export function tapExcerpt(
    raw: string,
    name: string,
    options: IExcerptOptions = {},
): string | undefined {
    const {before, after, maxLineLength} = {...DEFAULTS, ...options};
    // Collapsed first, so both the search and the window are measured in what is shown: a
    // dump of ninety lines costs one line of the budget, not ninety.
    const display = collapseHandles(raw.split(/\r?\n/));
    const index = locate(display, name);
    const from = Math.max(0, (index ?? display.length) - before);
    const to = index === undefined ? display.length : index + after + 1;
    const window = display.slice(from, to).map(line => truncate(line.trimEnd(), maxLineLength));
    // The stream ends with the run's totals and coverage gates, and a blank line means
    // nothing at either end of an excerpt.
    while (window.length > 0 && window.at(-1)?.trim() === '') window.pop();
    while (window.length > 0 && window[0]?.trim() === '') window.shift();
    const rebased = rebase(window, index === undefined ? 0 : indentOf(display[index]!));
    return rebased.length > 0 ? rebased.join('\n') : undefined;
}
