/**
 * The progress a step announced, as the tree a report draws (PRD R26/R27).
 *
 * A run announces one flat list — points and branches in the order they happened — and every
 * entry names the branches it sat *in*. That is all the nesting needs: a point belongs to the
 * innermost branch of its chain, a branch is the group of the points whose chains run through
 * it, and both come out in the order they were announced.
 *
 * The tree is built once, here, so the two renderers cannot disagree about it: the tap report
 * draws these nodes as nested sub-tests, and `blong-allure` writes them as nested steps.
 *
 * Positions are never read. A branch entry announced from another process carries only names —
 * the position a log mints describes a place in the execution that minted it — so a group is
 * identified by the *names* of the chain it stands for, which is also why two branches taken
 * the same way at the same level are one group rather than two identical ones.
 */

import type {
    IProgressEntry,
    IProgressNode,
    IRegionMark,
    ITestFrameworkContext,
} from './test-types.js';

/** How many properties of a point's data a comment carries. */
const MAX_COMMENT_PROPERTIES = 5;

/** Longest a rendered value may be, on its own, and longest the whole line may be. */
const MAX_VALUE_CHARS = 40;
const MAX_COMMENT_CHARS = 120;

/** One property of a point, rendered and measured so the shortest can be kept. */
interface IRenderedProperty {
    /** How it reads in the line. */
    text: string;
    /** Where it sat in the data, to keep equal-length properties in their own order. */
    order: number;
}

/**
 * A value as it reads in a comment, or `undefined` when it is too big to sit there.
 *
 * Scalars only need quoting where the quotes help: a string is written as one so a
 * value that reads like a number is still visibly a string.
 */
const renderValue = (value: unknown): string | undefined => {
    if (typeof value === 'string')
        return value.length <= MAX_VALUE_CHARS ? `'${value}'` : undefined;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (value === null) return 'null';
    const json = JSON.stringify(value);
    return json !== undefined && json.length <= MAX_VALUE_CHARS ? json : undefined;
};

/** How a branch is named in a report, in both renderers. */
const labelOf = (mark: IRegionMark): string => `${mark.discriminator} = ${mark.chosen}`;

/**
 * What a point reads as: its name, then the data worth printing beside it.
 *
 * Shortest property first, because a comment is one line and a value nobody can read
 * on it is no better than an omitted one — an object of ten fields would crowd out the
 * three numbers beside it. Values too long to sit on the line are left out, and the
 * count of what was left out is said, so the line never reads as the whole story.
 */
const commentLine = (node: IProgressNode): string => {
    const entries = Object.entries(node.data ?? {});
    if (entries.length === 0) return node.name;

    const rendered: IRenderedProperty[] = [];
    entries.forEach(([key, value], order) => {
        const text = renderValue(value);
        if (text !== undefined) rendered.push({text: `${key}=${text}`, order});
    });
    rendered.sort((a, b) => a.text.length - b.text.length || a.order - b.order);

    const parts: string[] = [];
    let width = node.name.length;
    for (const property of rendered) {
        if (parts.length === MAX_COMMENT_PROPERTIES) break;
        if (width + property.text.length + 2 > MAX_COMMENT_CHARS) break;
        parts.push(property.text);
        width += property.text.length + 2;
    }

    const omitted = entries.length - parts.length;
    const data = parts.length > 0 ? `: ${parts.join(', ')}` : '';
    const rest = omitted > 0 ? `${parts.length > 0 ? ', ' : ': '}+${omitted} more` : '';
    return `${node.name}${data}${rest}`;
};

/**
 * The identity of a chain of branches.
 *
 * JSON rather than a separator: a chain is only equal to another chain if every name in it is,
 * and building the key out of the names leaves nothing for a name containing the separator to
 * collide with.
 */
const keyOf = (chain: IRegionMark[]): string =>
    JSON.stringify(chain.map(mark => [mark.discriminator, mark.chosen]));

/**
 * Nest the entries an invocation announced into the tree a report draws.
 *
 * A branch becomes a group even when nothing was announced inside it: it was taken, and a
 * report that dropped it would be saying the code did not go that way.
 */
export function progressTree(entries: IProgressEntry[] | undefined): IProgressNode[] {
    const roots: IProgressNode[] = [];
    /** The group a chain of branches stands for, created where the chain was first named. */
    const opened = new Map<string, IProgressNode>();

    /**
     * The list a chain's children belong to, creating the group for any mark in it that no
     * entry has named yet — which is what a branch whose `run` threw leaves behind: the point
     * announced inside it still says which branch it was in, so the group is drawn from that.
     */
    const childrenOf = (chain: IRegionMark[]): IProgressNode[] => {
        let siblings = roots;
        const path: IRegionMark[] = [];
        for (const mark of chain) {
            path.push(mark);
            const key = keyOf(path);
            let node = opened.get(key);
            if (node === undefined) {
                node = {name: labelOf(mark), kind: 'region', children: []};
                opened.set(key, node);
                siblings.push(node);
            }
            siblings = node.children;
        }
        return siblings;
    };

    for (const entry of entries ?? []) {
        if (entry.kind === 'region') {
            childrenOf([...(entry.regions ?? []), entry]);
        } else {
            childrenOf(entry.regions ?? []).push({
                name: entry.name,
                kind: 'point',
                data: entry.data as Record<string, unknown> | undefined,
                children: [],
            });
        }
    }
    return roots;
}

/**
 * Report one node as the output its kind deserves, and whatever it holds.
 *
 * A branch is a sub-test, because the points taken inside it belong together and
 * a report that does not group them is not showing what the code did. A point is
 * a comment instead: it is a moment a step passed through rather than a piece of
 * work, so it does not earn a test of its own, and its data is what a reader
 * actually looks for — printed with it, as long as it is small enough to sit on a
 * line.
 *
 * The tap half of the rendering, and it lives beside the executor rather than in
 * the realm that asked for it because only the test framework's own context can
 * nest a test: the executor holds the step's context when the step's body has
 * finished, so this is called from there. A context that offers no nesting (a
 * plain `node:assert` step run without a test context, or a runner whose sub-test
 * context is not a test context) simply gets nothing, which is the degradation
 * this has to tolerate.
 */
export const reportProgress = async (
    context: ITestFrameworkContext,
    node: IProgressNode,
): Promise<void> => {
    if (node.kind === 'point') {
        context.comment?.(commentLine(node));
        return;
    }
    await context.test(node.name, async (nested: unknown) => {
        const inner = nested as ITestFrameworkContext | undefined;
        if (typeof inner?.test !== 'function') {
            return;
        }
        for (const child of node.children) {
            await reportProgress(inner, child);
        }
    });
};
