/**
 * Hard-wrapping to the repository's prettier width (`printWidth: 100`,
 * `proseWrap: always`), so the memory files need no separate formatter pass and
 * a `formatOnSave` in the editor is a no-op.
 *
 * What is never touched: fenced code blocks, tables, headings, the meta line,
 * HTML comments (the index markers), indented code and horizontal rules. What is
 * re-wrapped: prose paragraphs and list items, the latter keeping their marker
 * and a two-space continuation indent.
 */

import {INDEX_END, INDEX_START, MAX_LINE_LENGTH} from './memoryTypes.ts';

/** Placeholder that keeps the spaces inside an inline span out of the wrapper. */
const NO_SPACE = '\u0000';

/** Atoms stay on one line: an inline code span or a markdown link is one word. */
function protectSpans(text: string): string {
    return text
        .replace(/`[^`]*`/g, span => span.split(' ').join(NO_SPACE))
        .replace(/\[[^\]]*\]\([^)]*\)/g, span => span.split(' ').join(NO_SPACE));
}

function restoreSpans(text: string): string {
    return text.split(NO_SPACE).join(' ');
}

/**
 * Greedy wrap of one logical line.
 *
 * `firstIndent` prefixes the first output line (a bullet's own indentation),
 * `continuationIndent` the rest (its hanging indent).
 */
export function wrapText(
    text: string,
    firstIndent = '',
    continuationIndent = firstIndent,
    width = MAX_LINE_LENGTH,
): string[] {
    const words = protectSpans(text.trim())
        .split(/\s+/)
        .filter(word => word !== '');
    if (words.length === 0) return [firstIndent.trimEnd()];

    const lines: string[] = [];
    let current = '';
    let indent = firstIndent;
    for (const word of words) {
        if (current === '') {
            current = word;
        } else if (indent.length + current.length + 1 + word.length <= width) {
            current += ` ${word}`;
        } else {
            lines.push(restoreSpans(indent + current));
            indent = continuationIndent;
            current = word;
        }
    }
    lines.push(restoreSpans(indent + current));
    return lines;
}

/** A single wrapper with a per-line mode. */
type LineMode = 'verbatim' | 'text';

/** Lines that must survive re-wrapping untouched. */
function modeOf(line: string, inFence: boolean, inComment: boolean): LineMode {
    if (inComment) return 'verbatim';
    if (/^\s*(?:```|~~~)/.test(line)) return 'verbatim';
    if (inFence) return 'verbatim';
    if (/^#{1,6}\s/.test(line)) return 'verbatim';
    if (/^\s*\|/.test(line)) return 'verbatim';
    if (/^\s*<!--/.test(line)) return 'verbatim';
    if (/^\s{4,}\S/.test(line)) return 'verbatim';
    if (/^\s*(?:---|\*\*\*|___)\s*$/.test(line)) return 'verbatim';
    if (/^>?\s*_[^_]*·[^_]*·[^_]*_$/.test(line.trim())) return 'verbatim';
    return 'text';
}

/** True when a line opens or closes a fenced code block. */
function togglesFence(line: string): boolean {
    return /^\s*(?:```|~~~)/.test(line);
}

/** True when a line opens an HTML comment that is not closed on the same line. */
function opensComment(line: string): boolean {
    return /<!--/.test(line) && !/-->/.test(line);
}

/** Split a list item into its marker prefix, its text and its hanging indent. */
function splitListItem(line: string): {prefix: string; text: string; indent: string} | null {
    const match = /^(?<indent>\s*)(?<marker>[-*+]|\d+\.)\s+(?<text>.*)$/.exec(line);
    if (!match?.groups) return null;
    const {indent, marker, text} = match.groups as Record<string, string>;
    return {prefix: `${indent}${marker} `, text: text ?? '', indent: `${indent}  `};
}

/**
 * Re-wrap a whole document.
 *
 * Consecutive plain lines form one paragraph, which is what lets the legacy
 * prose in these files (already wrapped, with hanging indents) collapse back into
 * a canonical shape.
 */
export function formatLines(lines: readonly string[], width = MAX_LINE_LENGTH): string[] {
    const out: string[] = [];
    let inFence = false;
    let inComment = false;
    let paragraph: string[] = [];
    let paragraphPrefix = '';
    let paragraphIndent = '';

    const flush = () => {
        if (paragraph.length === 0) return;
        const text = paragraph.map(part => part.trim()).join(' ');
        out.push(...wrapText(text, paragraphPrefix, paragraphIndent || paragraphPrefix, width));
        paragraph = [];
        paragraphPrefix = '';
        paragraphIndent = '';
    };

    for (const line of lines) {
        if (
            paragraph.length > 0 &&
            (line.trim() === '' || modeOf(line, inFence, inComment) === 'verbatim')
        ) {
            flush();
        }

        if (modeOf(line, inFence, inComment) === 'verbatim') {
            out.push(line);
            if (togglesFence(line)) inFence = !inFence;
            if (inComment && /-->/.test(line)) inComment = false;
            else if (!inComment && opensComment(line)) inComment = true;
            continue;
        }

        if (line.trim() === '') {
            out.push('');
            continue;
        }

        if (paragraph.length === 0) {
            const item = splitListItem(line);
            paragraphPrefix = item ? item.prefix : (line.match(/^\s*/)?.[0] ?? '');
            paragraphIndent = item ? item.indent : paragraphPrefix;
            paragraph.push(item ? item.text : line);
        } else {
            paragraph.push(line);
        }
    }
    flush();

    return trimBlankRuns(spaceOutHeadings(out));
}

/**
 * A heading needs a blank line above and below it (markdownlint's MD022).
 *
 * Entries already have one, but the user's own list sits directly under
 * `## Manual`, and a list that starts on the heading line is exactly what MD022
 * and MD032 complain about.
 */
function spaceOutHeadings(lines: readonly string[]): string[] {
    const out: string[] = [];
    lines.forEach((line, index) => {
        const heading = /^#{1,6}\s/.test(line);
        if (heading && out.length > 0 && out[out.length - 1]!.trim() !== '') out.push('');
        out.push(line);
        if (heading && (lines[index + 1] ?? '').trim() !== '') out.push('');
    });
    return out;
}

/**
 * Collapse runs of blank lines outside code fences, and drop the leading and
 * trailing ones. Blank lines *inside* a fence are content and are preserved.
 */
export function trimBlankRuns(lines: readonly string[]): string[] {
    const out: string[] = [];
    let inFence = false;
    for (const line of lines) {
        const fence = /^\s*(?:```|~~~)/.test(line);
        if (fence) inFence = !inFence;
        const blank = line.trim() === '';
        if (blank && !inFence && (out.length === 0 || out[out.length - 1]?.trim() === '')) continue;
        out.push(line);
    }
    while (out.length > 0 && out[out.length - 1]?.trim() === '') out.pop();
    return out;
}

/** The full text of a file: the lines plus exactly one trailing newline. */
export function renderLines(lines: readonly string[]): string {
    const body = trimBlankRuns(asArray(lines));
    return body.length === 0 ? '' : `${body.join('\n')}\n`;
}

function asArray(lines: readonly string[]): string[] {
    return Array.isArray(lines) ? [...lines] : Array.from(lines);
}

/** True when the line is a generated-index marker. */
export function isIndexMarker(line: string): boolean {
    return line.trim() === INDEX_START || line.trim() === INDEX_END;
}
