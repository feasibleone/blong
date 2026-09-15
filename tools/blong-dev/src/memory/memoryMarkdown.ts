/**
 * Markdown formatting rules for memory files.
 *
 * `blong-dev lint` runs cspell and eslint but not markdownlint, so markdown
 * formatting problems were only ever visible in the editor. These are the rules
 * this file format can actually break — not the whole of markdownlint — checked
 * here so the CLI (and CI) can see them too.
 *
 * The rules the format deliberately does *not* follow are settled in the
 * repository's `.markdownlint.json` (line length 100, to match prettier).
 */

import type {} from './memoryTypes.ts';

export interface IMarkdownProblem {
    /** 1-based line number. */
    line: number;
    rule: string;
    message: string;
}

const FENCE = /^\s*(?:```|~~~)/;
const HEADING = /^(#{1,6})\s/;
const BULLET = /^\s*[-*+]\s/;
const ORDERED = /^\s*\d+[.)]\s/;
const TABLE = /^\s*\|/;
const HTML = /<\/?[a-zA-Z][^>]*>/;
const EMPHASIS_ONLY = /^\s*(?:\*\*[^*]+\*\*|_[^_]+_|\*[^*]+\*)\s*$/;

/**
 * Check the markdown shape of a document's lines.
 *
 * `exempt` holds 0-based line indices the format owns: the generated index block
 * and the user's own manual items, which are kept exactly as they were written.
 */
export function checkMarkdown(
    lines: readonly string[],
    exempt: ReadonlySet<number> = new Set(),
): IMarkdownProblem[] {
    const problems: IMarkdownProblem[] = [];
    const headings = new Map<string, number>();
    const report = (index: number, rule: string, message: string): void => {
        problems.push({line: index + 1, rule, message});
    };
    const exemptAt = (index: number): boolean => {
        if (exempt.has(index)) return true;
        // Also exempt the fence-free blank run that separates exempt regions.
        return exempt.has(index - 1) || exempt.has(index + 1);
    };

    let inFence = false;
    let previousLevel = 0;
    lines.forEach((line, index) => {
        const next = lines[index + 1] ?? '';
        const before = index === 0 ? '' : (lines[index - 1] ?? '');
        const blank = line.trim() === '';
        const fenced = inFence || FENCE.test(line);
        // An exempt line is one the format owns: the user's own items are kept as
        // they were written, so their indented fences and trailing spaces are not
        // ours to complain about. The fence state still has to be tracked.
        const owned = exemptAt(index);

        if (!owned) {
            if (line !== line.replace(/\s+$/, '')) report(index, 'MD009', 'trailing whitespace');
            if (/^\t/.test(line)) report(index, 'MD010', 'hard tab used for indentation');
        }
        if (!fenced && !owned) {
            if (HTML.test(line) && !line.includes('`')) {
                report(index, 'MD033', 'inline HTML reads as an element; wrap it in backticks');
            }
            if (EMPHASIS_ONLY.test(line))
                report(index, 'MD036', 'emphasis used instead of a heading');

            const heading = HEADING.exec(line);
            if (heading) {
                const level = heading[1]?.length ?? 0;
                if (previousLevel !== 0 && level > previousLevel + 1) {
                    report(index, 'MD001', `heading jumps from h${previousLevel} to h${level}`);
                }
                previousLevel = level;
                const title = line.replace(HEADING, '').trim();
                const seen = headings.get(title);
                if (seen !== undefined)
                    report(index, 'MD024', `duplicate heading (also on line ${seen})`);
                else headings.set(title, index + 1);
                if (before.trim() !== '') report(index, 'MD022', 'no blank line above the heading');
                if (next.trim() !== '') report(index, 'MD022', 'no blank line below the heading');
            }
        }

        // Lists, fences and tables need air around them, but only when they are
        // the first or last line of their block.
        if (!fenced && !owned) {
            const blockStart =
                (BULLET.test(line) || ORDERED.test(line) || TABLE.test(line)) &&
                !BULLET.test(before) &&
                !ORDERED.test(before) &&
                !TABLE.test(before);
            const blockEnd =
                (BULLET.test(line) || ORDERED.test(line) || TABLE.test(line)) &&
                !BULLET.test(next) &&
                !ORDERED.test(next) &&
                !TABLE.test(next);
            if (blockStart && before.trim() !== '')
                report(index, 'MD032', 'list or table needs a blank line above it');
            if (blockEnd && next.trim() !== '')
                report(index, 'MD031', 'list or table needs a blank line below it');
        }

        if (FENCE.test(line)) {
            if (!inFence && !owned) {
                if (line.replace(FENCE, '').trim() === '')
                    report(index, 'MD040', 'fenced code block has no language');
                if (before.trim() !== '')
                    report(index, 'MD031', 'code fence needs a blank line above it');
            }
            inFence = !inFence;
            if (!inFence && !owned && next.trim() !== '')
                report(index, 'MD031', 'code fence needs a blank line below it');
        }

        if (!owned) {
            if (blank && before.trim() === '' && index > 0)
                report(index, 'MD012', 'more than one blank line');
            if (blank && !inFence && /^\s{4,}\S/.test(next))
                report(index + 1, 'MD046', 'indented code block; use a fence');
        }
    });

    if (inFence) report(lines.length - 1, 'MD031', 'unclosed code fence');
    return problems;
}
