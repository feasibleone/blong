/**
 * Stack-trace compaction (PRD R2).
 *
 * Identity must not depend on stack depth or on line/column numbers: those
 * change with every edit and would shatter one failure into many templates.
 * The displayed stack is never altered — only the identity input (PRD R2
 * acceptance and the §5.1 "serializers" row).
 */

/** Frames retained in the identity input. */
const FRAMES = 2;

const FRAME = /at\s+(.+?)\s+\((.+?):\d+:\d+\)/g;

/** Reduce a stack trace to `Type frame -> frame` with line/column stripped. */
export function compactStack(stack: string): string {
    if (!stack) {
        return '';
    }
    const lines = stack.split('\n');
    // `split` always yields at least one element for the non-empty stack handled
    // above, so the `??` fallback cannot be taken; ignored rather than left as a
    // false gap. The `|| 'Error'` fallback below stays gated, because a blank
    // first line really does occur.
    /* v8 ignore next */
    const firstLine = lines[0] ?? '';
    const header = firstLine.replace(/:.*$/, '').trim() || 'Error';
    const frames = lines
        .slice(1)
        .map(line => {
            FRAME.lastIndex = 0;
            const match = FRAME.exec(line.trim());
            return match ? `${match[1]} (${match[2]})` : '';
        })
        .filter(Boolean)
        .slice(0, FRAMES);
    return frames.length ? `${header} ${frames.join(' -> ')}` : header;
}
