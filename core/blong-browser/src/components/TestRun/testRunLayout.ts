/**
 * Pure layout functions for the run tree-table and the dependency graph.
 *
 * No React, no DOM measurements: the component passes a logical size and draws what these return.
 */
import type {
    ITestEdgeModel,
    ITestGraphEdgeLayout,
    ITestGraphLayout,
    ITestGraphNodeLayout,
    ITestRunModel,
    ITestRunRowLayout,
    ITestRunTreeLayout,
    ITestStepModel,
    TestStepStatus,
} from '../../types/testRun.js';
import {formatOffset, groupKey, stepNames} from './testRunModel.js';

export interface ITestTreeOptions {
    collapsed?: ReadonlySet<string>;
    order?: 'tree' | 'start';
    now?: number;
    filter?: (step: ITestStepModel) => boolean;
}

export interface ITestGraphOptions {
    nodeWidth?: number;
    nodeHeight?: number;
    columnGap?: number;
    rowGap?: number;
    minHeight?: number;
    /** Fill this box instead of using fixed node sizes. */
    targetWidth?: number;
    targetHeight?: number;
    /** `auto` draws vertically when fewer than five steps share a level. */
    orientation?: 'auto' | 'horizontal' | 'vertical';
}

/** A connected part of the dependency graph. */
export interface IGraphComponent {
    steps: string[];
    edges: ITestEdgeModel[];
}

export interface IGraphSplit {
    /** Components with at least three steps: these are worth drawing as a graph. */
    graph: IGraphComponent;
    /** Single steps and pairs, rendered as a compact flex list instead of the graph. */
    loose: IGraphComponent[];
}

interface ITimeSpan {
    start: number;
    queueEnd: number;
    end: number;
}

interface IGroupNode {
    path: string[];
    name: string;
    entries: Array<{kind: 'group'; node: IGroupNode} | {kind: 'step'; step: ITestStepModel}>;
    steps: ITestStepModel[];
}

const clampPct = (value: number): number => Math.min(100, Math.max(0, value));

function aggregateStatus(steps: ITestStepModel[]): TestStepStatus {
    if (steps.some(step => step.status === 'failed')) return 'failed';
    if (steps.some(step => step.status === 'running')) return 'running';
    if (steps.some(step => step.status === 'completed')) {
        return steps.every(step => step.status === 'completed') ? 'completed' : 'running';
    }
    return 'pending';
}

function stepSpan(step: ITestStepModel, now: number): ITimeSpan | undefined {
    const start = step.queuedAt ?? step.startedAt;
    if (start === undefined) return undefined;
    const queueEnd = step.startedAt ?? start;
    const end = step.endedAt ?? (step.status === 'running' ? Math.max(now, queueEnd) : queueEnd);
    return {start, queueEnd, end: Math.max(end, queueEnd)};
}

/**
 * The union of the leaves' execution spans, used by a parent row.
 *
 * A parent shows what its leaves did, not the queue they waited in: the earliest leaf start to
 * the latest leaf end.
 */
function envelope(steps: ITestStepModel[], now: number): ITimeSpan | undefined {
    const spans = steps
        .map(step => {
            const start = step.startedAt ?? step.queuedAt;
            if (start === undefined) return undefined;
            const end = step.endedAt ?? (step.status === 'running' ? Math.max(now, start) : start);
            return {start, end};
        })
        .filter((span): span is {start: number; end: number} => !!span);
    if (!spans.length) return undefined;
    const start = Math.min(...spans.map(span => span.start));
    const end = Math.max(...spans.map(span => span.end));
    return {start, queueEnd: start, end};
}

function sumAssertions(steps: ITestStepModel[]): {total: number; threw: number} {
    return steps.reduce(
        (total, step) => ({
            total: total.total + (step.assertions?.total ?? 0),
            threw: total.threw + (step.assertions?.threw ?? 0),
        }),
        {total: 0, threw: 0},
    );
}

/** Build the group tree from the steps' `groupPath` values. */
function buildTree(run: ITestRunModel): IGroupNode {
    const root: IGroupNode = {path: [], name: run.name, entries: [], steps: []};
    const groups = new Map<string, IGroupNode>([[groupKey([]), root]]);
    const ensure = (path: string[]): IGroupNode => {
        const key = groupKey(path);
        const existing = groups.get(key);
        if (existing) return existing;
        const parent = ensure(path.slice(0, -1));
        const node: IGroupNode = {
            path,
            name: path[path.length - 1] ?? run.name,
            entries: [],
            steps: [],
        };
        groups.set(key, node);
        parent.entries.push({kind: 'group', node});
        return node;
    };
    for (const name of stepNames(run)) {
        const step = run.steps[name];
        const group = ensure(step.groupPath);
        group.entries.push({kind: 'step', step});
        let path = step.groupPath;
        while (true) {
            groups.get(groupKey(path))!.steps.push(step);
            if (!path.length) break;
            path = path.slice(0, -1);
        }
    }
    return root;
}

/**
 * The tree-table's rows: group rows followed by their children, or a flat start-time list.
 *
 * A collapsed group keeps its row and its envelope span, so its timing stays visible while its
 * children are hidden. A filter removes steps and any group left with no matching step.
 */
export function buildTreeLayout(
    run: ITestRunModel,
    options: ITestTreeOptions = {},
): ITestRunTreeLayout {
    const now = options.now ?? Date.now();
    const filter = options.filter;
    const rows: ITestRunRowLayout[] = [];
    const visibleSteps: string[] = [];

    if (options.order === 'start') {
        const steps = stepNames(run)
            .map(name => run.steps[name])
            .filter(step => !filter || filter(step))
            .sort(
                (a, b) =>
                    (a.startedAt ?? a.queuedAt ?? 0) - (b.startedAt ?? b.queuedAt ?? 0) ||
                    run.order.indexOf(a.stepName) - run.order.indexOf(b.stepName),
            );
        for (const step of steps) {
            rows.push(stepRow(step, 0, now));
            visibleSteps.push(step.stepName);
        }
    } else {
        const root = buildTree(run);
        const visit = (group: IGroupNode, depth: number): void => {
            const matching = filter ? group.steps.filter(step => filter(step)) : group.steps;
            if (filter && !matching.length) return;
            const collapsed = options.collapsed?.has(groupKey(group.path)) ?? false;
            const span = envelope(group.steps, now);
            rows.push({
                kind: 'group',
                key: groupKey(group.path),
                label: group.name,
                depth,
                groupPath: group.path,
                status: aggregateStatus(group.steps),
                span,
                duration: span ? span.end - span.start : undefined,
                assertions: sumAssertions(group.steps),
                childKeys: group.steps.map(step => step.stepName),
                collapsed,
                hiddenCount: group.steps.length - (collapsed ? 0 : matching.length),
            });
            if (collapsed) return;
            for (const entry of group.entries) {
                if (entry.kind === 'group') {
                    visit(entry.node, depth + 1);
                    continue;
                }
                if (filter && !filter(entry.step)) continue;
                rows.push(stepRow(entry.step, depth + 1, now));
                visibleSteps.push(entry.step.stepName);
            }
        };
        visit(root, 0);
    }

    const spans = stepNames(run)
        .map(name => stepSpan(run.steps[name], now))
        .filter((span): span is ITimeSpan => !!span);
    const t0 = Math.min(run.startedAt, ...spans.map(span => span.start));
    const latest = spans.length ? Math.max(...spans.map(span => span.end)) : run.startedAt;
    const running =
        run.status === 'running' ||
        stepNames(run).some(name => run.steps[name].status === 'running');
    const t1 = Math.max(latest, running ? now : latest, t0 + 1);
    return {
        t0,
        t1,
        ticks: niceTicks(t0, t1),
        rows,
        totalRows: stepNames(run).length,
        visibleSteps,
    };
}

function stepRow(step: ITestStepModel, depth: number, now: number): ITestRunRowLayout {
    const span = stepSpan(step, now);
    const duration =
        step.duration ??
        (step.startedAt !== undefined
            ? Math.max(0, (step.endedAt ?? now) - step.startedAt)
            : undefined);
    return {
        kind: 'step',
        key: step.stepName,
        label: step.displayName || step.stepName,
        depth,
        groupPath: step.groupPath,
        stepName: step.stepName,
        status: step.status,
        span,
        duration,
        assertions: step.assertions,
        hiddenCount: 0,
    };
}

/** Ticks at `1/2/5 × 10^n`, labelled relative to `t0`. */
export function niceTicks(t0: number, t1: number, max = 8): Array<{at: number; label: string}> {
    if (t1 - t0 <= 1) return [{at: t0, label: '0'}];
    const span = Math.max(1, t1 - t0);
    const raw = span / Math.max(1, max);
    const magnitude = 10 ** Math.floor(Math.log10(raw));
    const residual = raw / magnitude;
    const step = (residual > 5 ? 10 : residual > 2 ? 5 : residual > 1 ? 2 : 1) * magnitude;
    const first = Math.ceil(t0 / step) * step;
    const ticks: Array<{at: number; label: string}> = [];
    for (let at = first; at <= t1 + step * 0.001; at += step) {
        ticks.push({at, label: formatOffset(at - t0)});
        if (ticks.length > 100) break;
    }
    return ticks;
}

/** Percentages for a bar inside the shared time axis. */
export function barPct(
    span: ITimeSpan,
    t0: number,
    t1: number,
): {left: number; queueWidth: number; width: number} {
    const total = Math.max(1, t1 - t0);
    const left = clampPct(((span.start - t0) / total) * 100);
    const fullWidth = clampPct(((span.end - t0) / total) * 100) - left;
    const queueWidth = clampPct(((span.queueEnd - span.start) / total) * 100);
    return {
        left,
        queueWidth: Math.min(queueWidth, Math.max(0, fullWidth)),
        width: Math.max(0, fullWidth),
    };
}

export function nowPct(now: number, t0: number, t1: number): number {
    return clampPct(((now - t0) / Math.max(1, t1 - t0)) * 100);
}

/** Where an instant sits on the shared time axis, as a percentage. */
export function timePct(at: number, t0: number, t1: number): number {
    return clampPct(((at - t0) / Math.max(1, t1 - t0)) * 100);
}

/**
 * Separate the connected components of the dependency graph.
 *
 * A run often has one real chain plus several independent steps. Drawing the independent steps in
 * the same layered graph stretches its widest level and scales the whole drawing down, so single
 * steps and pairs are returned separately; the caller renders them as a compact flex list.
 */
export function splitDependencies(run: ITestRunModel): IGraphSplit {
    const names = stepNames(run);
    const adjacency = new Map<string, Set<string>>(names.map(name => [name, new Set<string>()]));
    for (const edge of run.edges) {
        if (!run.steps[edge.from] || !run.steps[edge.to]) continue;
        adjacency.get(edge.from)!.add(edge.to);
        adjacency.get(edge.to)!.add(edge.from);
    }
    const seen = new Set<string>();
    const components: IGraphComponent[] = [];
    for (const name of names) {
        if (seen.has(name)) continue;
        const stack = [name];
        const steps: string[] = [];
        seen.add(name);
        while (stack.length) {
            const current = stack.pop()!;
            steps.push(current);
            for (const next of adjacency.get(current) ?? []) {
                if (seen.has(next)) continue;
                seen.add(next);
                stack.push(next);
            }
        }
        steps.sort((a, b) => (run.order.indexOf(a) ?? 0) - (run.order.indexOf(b) ?? 0));
        const edges = run.edges.filter(
            edge => steps.includes(edge.from) && steps.includes(edge.to),
        );
        // A pair reads dependency first: `inactivity → cleanup`, not declaration order.
        if (steps.length === 2 && edges.length) {
            steps.splice(0, steps.length, edges[0].to, edges[0].from);
        }
        components.push({steps, edges});
    }
    const graph: IGraphComponent = {steps: [], edges: []};
    const loose: IGraphComponent[] = [];
    for (const component of components) {
        if (component.steps.length >= 3) {
            graph.steps.push(...component.steps);
            graph.edges.push(...component.edges);
        } else {
            loose.push(component);
        }
    }
    graph.steps.sort((a, b) => (run.order.indexOf(a) ?? 0) - (run.order.indexOf(b) ?? 0));
    return {graph, loose};
}

/**
 * Layered graph: a dependency sits one level before its dependent.
 *
 * The graph draws left to right when a level is wide (five or more parallel steps) and top to
 * bottom when it is not, because the graph's card is tall and narrow. Within a level, steps are
 * ordered by the mean position of their dependencies, falling back to declaration order, which
 * keeps a chain on one straight line and stacks parallel steps across the other axis.
 */
export function buildGraphLayout(
    run: ITestRunModel,
    options: ITestGraphOptions = {},
): ITestGraphLayout {
    let nodeWidth = options.nodeWidth ?? 128;
    let nodeHeight = options.nodeHeight ?? 26;
    let columnGap = options.columnGap ?? 48;
    let rowGap = options.rowGap ?? 14;
    const names = stepNames(run);
    const present = new Set(names);
    const upstream = new Map<string, string[]>();
    for (const name of names) upstream.set(name, []);
    for (const edge of run.edges) {
        if (!present.has(edge.from) || !present.has(edge.to)) continue;
        upstream.get(edge.from)!.push(edge.to);
    }
    const levelCache = new Map<string, number>();
    const levelOf = (name: string, seen = new Set<string>()): number => {
        const cached = levelCache.get(name);
        if (cached !== undefined) return cached;
        if (seen.has(name)) return 0;
        seen.add(name);
        const deps = upstream.get(name) ?? [];
        const level = deps.length
            ? 1 + Math.max(...deps.map(dep => levelOf(dep, new Set(seen))))
            : 0;
        levelCache.set(name, level);
        return level;
    };
    const levels = new Map<number, string[]>();
    for (const name of names) {
        const level = levelOf(name);
        const bucket = levels.get(level);
        if (bucket) bucket.push(name);
        else levels.set(level, [name]);
    }
    const orderIndex = new Map(names.map((name, index) => [name, index]));
    const position = new Map<string, number>();
    const sortedLevels = Array.from(levels.entries()).sort(([a], [b]) => a - b);
    for (const [level, bucket] of sortedLevels) {
        bucket.sort((a, b) => {
            const mean = (name: string): number => {
                const deps = upstream.get(name) ?? [];
                if (!deps.length) return orderIndex.get(name) ?? 0;
                const positions = deps
                    .map(dep => position.get(dep))
                    .filter((value): value is number => value !== undefined);
                return positions.length
                    ? positions.reduce((sum, value) => sum + value, 0) / positions.length
                    : (orderIndex.get(name) ?? 0);
            };
            return mean(a) - mean(b) || (orderIndex.get(a) ?? 0) - (orderIndex.get(b) ?? 0);
        });
        bucket.forEach((name, index) => position.set(name, index));
        levels.set(level, bucket);
    }
    const nodes: ITestGraphNodeLayout[] = [];
    const byName: Record<string, ITestGraphNodeLayout> = {};
    const maxRows = sortedLevels.reduce((max, [, bucket]) => Math.max(max, bucket.length), 0);
    const vertical =
        options.orientation === 'vertical' || (options.orientation !== 'horizontal' && maxRows < 5);
    const columns = vertical ? maxRows : sortedLevels.length;
    const rows = vertical ? sortedLevels.length : maxRows;
    let startX = 0;
    let startY = 0;
    if (options.targetWidth && options.targetHeight && columns > 0 && rows > 0) {
        const minGap = 20;
        nodeWidth = Math.max(
            56,
            Math.min(vertical ? 280 : 200, options.targetWidth / columns - minGap),
        );
        nodeHeight = Math.max(
            vertical ? 28 : 24,
            Math.min(vertical ? 64 : 44, options.targetHeight / rows - minGap),
        );
        columnGap =
            columns > 1
                ? Math.max(minGap, (options.targetWidth - columns * nodeWidth) / (columns - 1))
                : 0;
        rowGap =
            rows > 1
                ? Math.max(minGap, (options.targetHeight - rows * nodeHeight) / (rows - 1))
                : 0;
        const totalWidth = columns * nodeWidth + (columns - 1) * columnGap;
        const totalHeight = rows * nodeHeight + (rows - 1) * rowGap;
        startX = (options.targetWidth - totalWidth) / 2;
        startY = (options.targetHeight - totalHeight) / 2;
    }
    for (const [level, bucket] of sortedLevels) {
        bucket.forEach((name, index) => {
            const node: ITestGraphNodeLayout = {
                stepName: name,
                label: run.steps[name].displayName || name,
                level,
                index,
                x: vertical
                    ? startX + index * (nodeWidth + columnGap)
                    : startX + level * (nodeWidth + columnGap),
                y: vertical
                    ? startY + level * (nodeHeight + rowGap)
                    : startY + index * (nodeHeight + rowGap),
                width: nodeWidth,
                height: nodeHeight,
            };
            nodes.push(node);
            byName[name] = node;
        });
    }
    const edges: ITestGraphEdgeLayout[] = [];
    for (const edge of run.edges) {
        const dependent = byName[edge.from];
        const dependency = byName[edge.to];
        if (!dependent || !dependency) continue;
        edges.push({edge, path: edgePath(dependency, dependent, vertical)});
    }
    const computedWidth = columns * nodeWidth + Math.max(0, columns - 1) * columnGap;
    const computedHeight = rows * nodeHeight + Math.max(0, rows - 1) * rowGap;
    return {
        width: Math.max(options.targetWidth ?? nodeWidth, computedWidth),
        height: Math.max(options.targetHeight ?? options.minHeight ?? 120, computedHeight),
        nodes,
        edges,
        byName,
    };
}

/** A cubic curve from a dependency's edge to its dependent's edge. */
function edgePath(from: ITestGraphNodeLayout, to: ITestGraphNodeLayout, vertical: boolean): string {
    if (vertical) {
        const x1 = from.x + from.width / 2;
        const y1 = from.y + from.height;
        const x2 = to.x + to.width / 2;
        const y2 = to.y;
        const bend = Math.max(18, (y2 - y1) * 0.45);
        return `M ${x1} ${y1} C ${x1} ${y1 + bend}, ${x2} ${y2 - bend}, ${x2} ${y2}`;
    }
    const x1 = from.x + from.width;
    const y1 = from.y + from.height / 2;
    const x2 = to.x;
    const y2 = to.y + to.height / 2;
    const bend = Math.max(18, (x2 - x1) * 0.45);
    return `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`;
}

/** A tiny helper for the graph's edge tooltips. */
export const edgeLabel = (edge: ITestEdgeModel): string =>
    `${edge.from} reads ${edge.property} from ${edge.to}`;
