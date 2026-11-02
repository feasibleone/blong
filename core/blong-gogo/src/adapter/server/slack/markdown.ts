/**
 * `slack/markdown.ts` — a model's answer, written in Markdown, as Slack reads it.
 *
 * Slack's `mrkdwn` is a dialect and not Markdown: `**bold**` arrives literally, `# heading` is plain
 * text, `[text](url)` is not a link, and a table is a smear of pipes. A model answers in Markdown, so
 * everything it produces would otherwise teach the reader to decode its punctuation (`@@D-730`).
 *
 * The translation is deliberately one-way and lossless where Slack has an equivalent: bold becomes
 * `*`, a heading becomes a bold line, a link becomes `<url|text>`, an unordered list becomes bullets,
 * and a table becomes a code block, which is the only shape a fixed-width grid survives in.
 */

/** Escape the three characters Slack's mrkdwn uses for its own syntax. */
const escapeSlack = (text: string): string =>
    text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

/**
 * Inline Markdown, inside one line of text that is already escaped.
 *
 * Code spans are lifted out first and put back at the end: their content is literal, and converting
 * the `*` inside `a * b` would edit somebody's expression.
 */
const inline = (text: string): string => {
    const codes: string[] = [];
    const bolds: string[] = [];
    let out = text.replace(/`([^`\n]+)`/g, (_all, code: string) => {
        codes.push(code);
        return `\u0000${codes.length - 1}\u0000`;
    });
    out = out
        // A text message cannot carry an image, so it is named and linked instead.
        .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_all, alt: string, url: string) =>
            alt ? `_${alt}_ <${url}>` : `<${url}>`,
        )
        .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<$2|$1>')
        // Bold is taken out of the text before italic is looked for, and put back afterwards: a bold
        // marker is a pair of the marker Italic is written with, so the second pass would eat it
        // (`@@D-730`).
        .replace(/\*\*\*([^*]+)\*\*\*/g, (_all, inner: string) => {
            bolds.push(`*_${inner}_*`);
            return `\u0002${bolds.length - 1}\u0002`;
        })
        .replace(/\*\*([^*]+)\*\*/g, (_all, inner: string) => {
            bolds.push(`*${inner}*`);
            return `\u0002${bolds.length - 1}\u0002`;
        })
        .replace(/__([^_]+)__/g, (_all, inner: string) => {
            bolds.push(`*${inner}*`);
            return `\u0002${bolds.length - 1}\u0002`;
        })
        .replace(/(^|[^\w*])\*([^*\n]+)\*/g, '$1_$2_')
        .replace(/(^|[^\w_])_([^_\n]+)_/g, '$1_$2_')
        .replace(/~~([^~]+)~~/g, '~$1~');
    return out
        .replace(/\u0002(\d+)\u0002/g, (_all, index: string) => bolds[Number(index)] ?? '')
        .replace(/\u0000(\d+)\u0000/g, (_all, index: string) => `\`${codes[Number(index)]}\``);
};

/** A list marker as Slack renders it, indented by its depth. */
const listLine = (line: string): string | undefined => {
    const found = /^(\s*)[-*+]\s+(.*)$/.exec(line);
    if (!found) {
        const ordered = /^(\s*)(\d+)[.)]\s+(.*)$/.exec(line);
        if (!ordered) return undefined;
        return `${ordered[1]}${ordered[2]}. ${inline(ordered[3])}`;
    }
    const depth = Math.floor((found[1] ?? '').length / 2);
    return `${'   '.repeat(depth)}• ${inline(found[2])}`;
};

/** A table row, as something a reader can still scan outside a code block. */
const isTable = (lines: string[], index: number): boolean =>
    /^\s*\|.*\|\s*$/.test(lines[index] ?? '') &&
    /^\s*\|[\s:|-]+\|\s*$/.test(lines[index + 1] ?? '');

export const slackMarkdown = (markdown: string): string => {
    const lines = markdown.replace(/\r\n/g, '\n').split('\n');
    const out: string[] = [];
    let fence: string[] | undefined;
    for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index] ?? '';
        const fenceMatch = /^\s*```/.exec(line);
        if (fenceMatch) {
            if (fence) {
                out.push(...fence, '```');
                fence = undefined;
            } else {
                fence = [line.trim()];
            }
            continue;
        }
        if (fence) {
            fence.push(line);
            continue;
        }
        if (isTable(lines, index)) {
            // Slack has no table: keep it monospaced, where the columns still line up.
            const rows: string[] = [];
            while (index < lines.length && /^\s*\|/.test(lines[index] ?? '')) {
                const row = lines[index] ?? '';
                if (!/^\s*\|[\s:|-]+\|\s*$/.test(row)) rows.push(row.trim());
                index += 1;
            }
            index -= 1;
            out.push('```', ...rows, '```');
            continue;
        }
        const heading = /^(#{1,6})\s+(.*)$/.exec(line);
        if (heading) {
            out.push(`*${inline(escapeSlack(heading[2] ?? ''))}*`);
            continue;
        }
        if (/^\s*([-*_])\s*\1\s*\1[\s-*_]*$/.test(line)) {
            out.push('———');
            continue;
        }
        const item = listLine(line);
        if (item) {
            out.push(item);
            continue;
        }
        const quote = /^>\s?(.*)$/.exec(line);
        if (quote) {
            out.push(`> ${inline(escapeSlack(quote[1] ?? ''))}`);
            continue;
        }
        out.push(inline(escapeSlack(line)));
    }
    if (fence) out.push(...fence, '```');
    // Slack collapses runs of blank lines; two are enough to separate anything.
    // Only the outside blank lines go: a leading indent is a list's own.
    return out
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .replace(/^\n+/, '')
        .replace(/\s+$/, '');
};

/**
 * Slack's own limit on one message's text.
 *
 * A model that writes more than this is split into several messages rather than truncated: a reply cut
 * mid-sentence is worse than two replies.
 */
export const SLACK_TEXT_LIMIT = 3_500;

/**
 * Converted text, cut into pieces at paragraph boundaries where it can be.
 *
 * Separate from the conversion on purpose: a caller that splits what it already converted must not run
 * the conversion again, or `*bold*` becomes `_bold_` on the second pass.
 */
export const splitSlackText = (text: string, limit = SLACK_TEXT_LIMIT): string[] => {
    if (text.length <= limit) return text ? [text] : [];
    const chunks: string[] = [];
    let current = '';
    for (const paragraph of text.split('\n\n')) {
        const candidate = current ? `${current}\n\n${paragraph}` : paragraph;
        if (candidate.length <= limit) {
            current = candidate;
            continue;
        }
        if (current) chunks.push(current);
        let rest = paragraph;
        while (rest.length > limit) {
            const cut = rest.lastIndexOf('\n', limit);
            const at = cut > limit / 2 ? cut : limit;
            chunks.push(rest.slice(0, at));
            rest = rest.slice(at).replace(/^\n/, '');
        }
        current = rest;
    }
    if (current) chunks.push(current);
    return chunks;
};

/** Markdown as Slack reads it, cut into pieces a message can carry. */
export const slackChunks = (markdown: string, limit = SLACK_TEXT_LIMIT): string[] =>
    splitSlackText(slackMarkdown(markdown), limit);
