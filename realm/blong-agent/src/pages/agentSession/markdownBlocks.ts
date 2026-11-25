/**
 * A message split into what renders as prose, a diagram and code (`@@T-799`).
 *
 * The page streams deltas, so it is handed markdown that is often half written: a fence opens, three
 * of its lines are there, the rest has not arrived. Rendering that half as a diagram makes the page
 * flash — a mermaid block that is parsed as invalid, then valid, once per delta — which is why a fence
 * with no closing marker comes back as `pending` and is drawn as text.
 *
 * The split is done here rather than by the renderer because every renderer disagrees about the
 * incomplete case, and the answer is the same for all of them: nothing is rendered until the block it
 * is part of has been closed.
 */

export type MarkdownBlock =
    | {kind: 'markdown'; text: string}
    | {kind: 'mermaid'; text: string}
    | {kind: 'code'; language: string; text: string}
    /** An unterminated fence: drawn as its own text, never as the block it is about to become. */
    | {kind: 'pending'; language: string; text: string};

/** Languages rendered as a diagram rather than as code. */
const DIAGRAMS = new Set(['mermaid']);

const FENCE = /^(\s*)(`{3,}|~{3,})\s*([^\s`~]*)\s*$/;

/**
 * Split a message at its top-level fences.
 *
 * Only fences that begin a line count, and a fence inside one is text — which is what markdown says
 * and what a tool result quoting another fence needs.
 */
export const markdownBlocksOf = (source: string): MarkdownBlock[] => {
    const blocks: MarkdownBlock[] = [];
    const lines = source.split('\n');
    let prose: string[] = [];
    const flushProse = (): void => {
        const text = prose.join('\n');
        if (text.trim() !== '') blocks.push({kind: 'markdown', text});
        prose = [];
    };

    for (let index = 0; index < lines.length; index++) {
        const open = FENCE.exec(lines[index] ?? '');
        if (!open) {
            prose.push(lines[index] ?? '');
            continue;
        }
        const marker = open[2] ?? '```';
        const language = (open[3] ?? '').toLowerCase();
        const body: string[] = [];
        let closed = false;
        let cursor = index + 1;
        for (; cursor < lines.length; cursor++) {
            const line = lines[cursor] ?? '';
            const close = FENCE.exec(line);
            // The closing marker is the same character, at least as long: ``` closing ~~~ would be a
            // fence that never ends, and a page that waited for it would hold the whole tail.
            if (close && close[2]?.startsWith(marker[0] ?? '`') && close[3] === '') {
                closed = true;
                break;
            }
            body.push(line);
        }
        flushProse();
        const text = body.join('\n');
        if (!closed) {
            blocks.push({kind: 'pending', language, text});
            return blocks;
        }
        if (DIAGRAMS.has(language)) blocks.push({kind: 'mermaid', text});
        else blocks.push({kind: 'code', language: language === '' ? 'text' : language, text});
        index = cursor;
    }
    flushProse();
    return blocks;
};

/** Whether a message has a fence still open — what a page uses to postpone a render. */
export const markdownPending = (source: string): boolean =>
    markdownBlocksOf(source).some(block => block.kind === 'pending');
