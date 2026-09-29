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

/** Placeholder that keeps an inline code span out of the emphasis normaliser. */
const SHIELDED = '\u0001';

/**
 * Emphasis, as a single atom: `_two words_` wrapped across two lines is MD037,
 * and the line break is the wrapper's choice, so the wrapper must not make it.
 *
 * The span is bounded to a phrase (at most six words). Unbounded, a stray
 * underscore would pair with the next one anywhere in a paragraph and make the
 * whole of it one atom that could not be wrapped at all — which is how a body
 * ended up as a 322-character line.
 */
const EMPHASIS_WORDS = String.raw`[^\s*_]+(?:\s+[^\s*_]+){0,5}`;
const EMPHASIS = new RegExp(
    String.raw`(?<![\w*])(\*\*${EMPHASIS_WORDS}\*\*|\*${EMPHASIS_WORDS}\*|_${EMPHASIS_WORDS}_)(?![\w*])`,
    'g',
);

/**
 * Tokens markdown reads as block syntax when a line opens with them: `#fff` is a
 * heading (MD018), `1)` and `1.` list items (MD031/MD032), `-`/`*`/`+` bullets,
 * `>` a quote, `|` a table row. Prose arrives with all of them (a colour
 * literal, a numbered option) and a wrap that lands one at the start of a line
 * puts the file outside the gate the tool itself runs — so the wrap avoids it.
 */
const BLOCK_OPENER = /^(?:[-*+>|]|#{1,6}[^#\s]|\d+[.)])/;

/**
 * Single-asterisk emphasis, the one span the normaliser rewrites. `**bold**` is
 * not a match (both of its markers have another asterisk beside them), and
 * neither is a glob: `*.test.ts` has no closing marker.
 */
const ASTERISK_EMPHASIS = new RegExp(String.raw`(?<![\w*])\*(${EMPHASIS_WORDS})\*(?![\w*])`, 'g');

/**
 * Asterisk emphasis is not the emphasis this repository uses: markdownlint's
 * MD049 rewrites it, so a body that arrives with it fails the gate the CLI itself
 * runs. Only a real emphasis span is converted, and code spans are shielded first
 * — `` `git log --xxx` `` must keep its own characters.
 */
function normalizeEmphasis(text: string): string {
    const code: string[] = [];
    const shielded = text.replace(
        /`[^`]*`/g,
        span => `${SHIELDED}${code.push(span) - 1}${SHIELDED}`,
    );
    return shielded
        .replace(ASTERISK_EMPHASIS, '_$1_')
        .replace(
            new RegExp(`${SHIELDED}(\\d+)${SHIELDED}`, 'g'),
            (_match, index: string) => code[Number(index)] ?? '',
        );
}

/** Atoms stay on one line: an inline code span, a markdown link, emphasis. */
function protectSpans(text: string): string {
    return normalizeEmphasis(text)
        .replace(/`[^`]*`/g, span => span.split(' ').join(NO_SPACE))
        .replace(/\[[^\]]*\]\([^)]*\)/g, span => span.split(' ').join(NO_SPACE))
        .replace(EMPHASIS, span => span.split(' ').join(NO_SPACE));
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
            // A continuation line may not open a block. When the next word would,
            // the previous line's last word is pulled down with it — the wrap chose
            // the break, so the wrap is what has to move it, and one word is enough
            // (the marker is never the line's first word after that). A paragraph
            // that *starts* with such a token cannot be helped here: the check
            // reports it and the author backticks it.
            let carry = '';
            if (BLOCK_OPENER.test(word) && current.includes(' ')) {
                const parts = current.split(' ');
                carry = parts.pop() ?? '';
                current = parts.join(' ');
            }
            lines.push(restoreSpans(indent + current));
            indent = continuationIndent;
            current = carry === '' ? word : `${carry} ${word}`;
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

/**
 * The one section the tool does not own: `## Manual` is the user's own list, and
 * `checkMarkdown` exempts it — so the wrapper has to keep it verbatim instead of
 * re-flowing the items into one paragraph, which is what a format pass did once.
 */
const MANUAL_HEADING = /^##\s+Manual\s*$/;

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
    let inManual = false;
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
        if (MANUAL_HEADING.test(line)) inManual = true;
        else if (inManual && /^##\s/.test(line)) inManual = false;
        else if (inManual) {
            if (paragraph.length > 0) flush();
            if (togglesFence(line)) inFence = !inFence;
            out.push(line);
            continue;
        }
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
