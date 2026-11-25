/**
 * A prose block, read into what a component can render (`@@T-799`).
 *
 * The page needs markdown, not a markdown engine: a message carries headings, lists, a table, inline
 * code and the two emphasis spans, and everything else is a paragraph. So this reads exactly that and
 * returns a tree, which keeps the React side a switch rather than a parser and lets the parsing be
 * asserted without a browser.
 *
 * Nothing is passed through as HTML. A model's output is text a person reads, and a renderer that
 * accepted markup would let a session's transcript run script in the page that shows it.
 */

export type InlineSpan =
    | {kind: 'text'; text: string}
    | {kind: 'code'; text: string}
    | {kind: 'strong'; text: string}
    | {kind: 'em'; text: string}
    | {kind: 'link'; text: string; href: string};

export type ProseBlock =
    | {kind: 'heading'; level: number; spans: InlineSpan[]}
    | {kind: 'paragraph'; spans: InlineSpan[]}
    | {kind: 'list'; ordered: boolean; items: InlineSpan[][]}
    | {kind: 'table'; header: InlineSpan[][]; rows: InlineSpan[][][]}
    | {kind: 'quote'; spans: InlineSpan[]}
    | {kind: 'rule'};

const HEADING = /^(#{1,6})\s+(.*)$/;
const BULLET = /^\s*[-*+]\s+(.*)$/;
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/;
const QUOTE = /^\s*>\s?(.*)$/;
const RULE = /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/;
const TABLE_ROW = /^\s*\|(.+)\|\s*$/;
const TABLE_DIVIDER = /^\s*\|[\s:|-]+\|\s*$/;

/** A link only where the target is http(s) or a fragment: nothing else is followed from a transcript. */
const SAFE_LINK = /^(?:https?:\/\/|#)/i;

/**
 * Read the inline spans of one line.
 *
 * Code first, because a code span is where the emphasis markers are literal — a paragraph that
 * explains `_italics_` must not italicise the example.
 */
export const inlineSpansOf = (text: string): InlineSpan[] => {
    const spans: InlineSpan[] = [];
    const pattern = /(`[^`]+`)|(\*\*[^*]+\*\*)|(_[^_]+_)|(\*[^*]+\*)|(\[[^\]]+\]\([^)]+\))/g;
    let cursor = 0;
    for (const match of text.matchAll(pattern)) {
        const at = match.index ?? 0;
        if (at > cursor) spans.push({kind: 'text', text: text.slice(cursor, at)});
        const token = match[0];
        if (token.startsWith('`')) {
            spans.push({kind: 'code', text: token.slice(1, -1)});
        } else if (token.startsWith('**')) {
            spans.push({kind: 'strong', text: token.slice(2, -2)});
        } else if (token.startsWith('_')) {
            spans.push({kind: 'em', text: token.slice(1, -1)});
        } else if (token.startsWith('*')) {
            spans.push({kind: 'em', text: token.slice(1, -1)});
        } else {
            const label = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token);
            const href = label?.[2] ?? '';
            if (label && SAFE_LINK.test(href)) {
                spans.push({kind: 'link', text: label[1] ?? '', href});
            } else {
                // An unsafe target keeps its label and loses the link: a reader sees what was
                // written, and nothing offers to navigate anywhere the page has not agreed to.
                spans.push({kind: 'text', text: label?.[1] ?? token});
            }
        }
        cursor = at + token.length;
    }
    if (cursor < text.length) spans.push({kind: 'text', text: text.slice(cursor)});
    return spans.length > 0 ? spans : [{kind: 'text', text}];
};

const cellsOf = (line: string): InlineSpan[][] => {
    const inner = TABLE_ROW.exec(line)?.[1] ?? '';
    return inner.split('|').map(cell => inlineSpansOf(cell.trim()));
};

/** Read a prose block. */
export const proseBlocksOf = (source: string): ProseBlock[] => {
    const blocks: ProseBlock[] = [];
    const lines = source.split('\n');
    let paragraph: string[] = [];
    const flush = (): void => {
        if (paragraph.length === 0) return;
        blocks.push({kind: 'paragraph', spans: inlineSpansOf(paragraph.join(' ').trim())});
        paragraph = [];
    };

    for (let index = 0; index < lines.length; index++) {
        const line = lines[index] ?? '';
        if (line.trim() === '') {
            flush();
            continue;
        }
        const heading = HEADING.exec(line);
        if (heading) {
            flush();
            blocks.push({
                kind: 'heading',
                level: (heading[1] ?? '#').length,
                spans: inlineSpansOf(heading[2] ?? ''),
            });
            continue;
        }
        if (RULE.test(line)) {
            flush();
            blocks.push({kind: 'rule'});
            continue;
        }
        const quote = QUOTE.exec(line);
        if (quote) {
            flush();
            const quoted: string[] = [quote[1] ?? ''];
            while (index + 1 < lines.length && QUOTE.test(lines[index + 1] ?? '')) {
                quoted.push(QUOTE.exec(lines[index + 1] ?? '')?.[1] ?? '');
                index += 1;
            }
            blocks.push({kind: 'quote', spans: inlineSpansOf(quoted.join(' ').trim())});
            continue;
        }
        // A table is a header row, a divider and the rows under it; without the divider it is prose.
        if (TABLE_ROW.test(line) && TABLE_DIVIDER.test(lines[index + 1] ?? '')) {
            flush();
            const header = cellsOf(line);
            const rows: InlineSpan[][][] = [];
            index += 2;
            while (index < lines.length && TABLE_ROW.test(lines[index] ?? '')) {
                rows.push(cellsOf(lines[index] ?? ''));
                index += 1;
            }
            index -= 1;
            blocks.push({kind: 'table', header, rows});
            continue;
        }
        const bullet = BULLET.exec(line);
        const numbered = NUMBERED.exec(line);
        if (bullet || numbered) {
            flush();
            const ordered = numbered !== null;
            const items: InlineSpan[][] = [];
            let cursor = index;
            for (; cursor < lines.length; cursor++) {
                const item = ordered
                    ? NUMBERED.exec(lines[cursor] ?? '')
                    : BULLET.exec(lines[cursor] ?? '');
                if (!item) break;
                items.push(inlineSpansOf(item[1] ?? ''));
            }
            blocks.push({kind: 'list', ordered, items});
            index = cursor - 1;
            continue;
        }
        paragraph.push(line.trim());
    }
    flush();
    return blocks;
};
