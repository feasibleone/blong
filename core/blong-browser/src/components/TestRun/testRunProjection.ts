/**
 * Pure projection of executor progress into the console model.
 *
 * Kept free of the executor class and of React so a server host can import it through
 * `@feasibleone/blong-browser/testRun.ts`; the browser source and the server runner share it.
 */
import type {
    IAssertion,
    IDependencyEdge,
    IDependencyGraph,
    IStepProgress,
    ITestLatency,
    ITestProgress,
    StepArray,
} from '@feasibleone/blong-chain/browser.ts';
import type {
    ITestAssertionModel,
    ITestEdgeModel,
    ITestRunModel,
    ITestSourcePointer,
    ITestStepModel,
} from '../../types/testRun.js';
import {deriveTestRun} from './testRunModel.ts';

export interface ITestRunProjectionOptions {
    name: string;
    method: string;
    steps: StepArray;
    concurrency?: number;
    source?: {file?: string};
}

let runCounter = 0;

/** The largest JSON payload a step result may contribute to the wire model. */
const RESULT_LIMIT = 32_000;

/**
 * Make a step result JSON-safe and bounded.
 *
 * A result can be circular, hold functions or be megabytes of rows; the console only needs a
 * preview. A JSON round-trip drops what cannot cross the wire, and a payload over the limit is
 * replaced by a marker so the browser never receives the whole result.
 */
export function sanitizeResult(value: unknown): {
    result?: unknown;
    resultTruncated?: boolean;
} {
    if (value === undefined) return {};
    try {
        const json = JSON.stringify(value);
        if (json === undefined) return {};
        if (json.length > RESULT_LIMIT) {
            return {result: {truncated: true, bytes: json.length}, resultTruncated: true};
        }
        return {result: JSON.parse(json)};
    } catch {
        return {result: {truncated: true}, resultTruncated: true};
    }
}

const wireStatus = (status: IStepProgress['status']): ITestStepModel['status'] => status;

function pointer(source: IStepProgress['sourceLocation']): ITestSourcePointer | undefined {
    return source ? {file: source.file, line: source.line, column: source.column} : undefined;
}

function assertionModel(assertion: IAssertion): ITestAssertionModel {
    return {
        message: assertion.message,
        passed: assertion.passed,
        timestamp: assertion.timestamp,
        source: pointer(assertion.source),
    };
}

function edgeModel(edge: IDependencyEdge, run: ITestRunModel): ITestEdgeModel {
    const from = run.steps[edge.from]?.status;
    const to = run.steps[edge.to]?.status;
    const status: ITestEdgeModel['status'] =
        from === 'completed' && to === 'completed'
            ? 'done'
            : from === 'running' || to === 'running'
              ? 'active'
              : 'pending';
    return {
        id: `${edge.from}->${edge.to}:${edge.property}`,
        from: edge.from,
        to: edge.to,
        property: edge.property,
        status,
    };
}

function countsOf(run: ITestRunModel): ITestRunModel['counts'] {
    const counts = {total: 0, pending: 0, running: 0, completed: 0, failed: 0};
    for (const step of Object.values(run.steps)) {
        counts.total += 1;
        counts[step.status] += 1;
    }
    return counts;
}

function stepModels(
    steps: StepArray,
    groupPath: string[],
    order: string[],
    map: Record<string, ITestStepModel>,
): void {
    for (const item of steps) {
        if (Array.isArray(item)) {
            if (item.every(entry => typeof entry === 'string')) continue;
            const group = item as StepArray;
            stepModels(
                group,
                [...groupPath, group.name ?? `group-${groupPath.length}`],
                order,
                map,
            );
            continue;
        }
        if (typeof item !== 'function') continue;
        const stepName = item.name || 'anonymous';
        if (map[stepName]) continue;
        order.push(stepName);
        map[stepName] = {
            stepName,
            displayName: stepName,
            groupPath,
            status: 'pending',
            dependencies: [],
            dependents: [],
            assertions: {total: 0, threw: 0},
        };
    }
}

export function pendingBrowserRun(options: ITestRunProjectionOptions): ITestRunModel {
    const order: string[] = [];
    const steps: Record<string, ITestStepModel> = {};
    stepModels(options.steps, [], order, steps);
    const runId = `run-browser-${Date.now()}-${runCounter++}`;
    return deriveTestRun({
        runId,
        name: options.name,
        method: options.method,
        host: 'browser',
        status: 'pending',
        startedAt: Date.now(),
        concurrency: options.concurrency ?? 10,
        order,
        steps,
        edges: [],
        groups: [],
        counts: {total: 0, pending: 0, running: 0, completed: 0, failed: 0},
        assertions: {total: 0, threw: 0},
        criticalPath: [],
        logs: [],
        source: options.source,
    });
}

export function projectBrowserRun(
    base: ITestRunModel,
    progress: ITestProgress,
    graph: IDependencyGraph,
    latency: ITestLatency,
): ITestRunModel {
    const steps: Record<string, ITestStepModel> = {};
    for (const [name, step] of progress.steps) {
        const firstAssertionSource = step.assertionLog?.find(assertion => assertion.source)?.source;
        const projectedResult = sanitizeResult(step.result);
        steps[name] = {
            stepName: step.stepName,
            displayName: step.displayName,
            groupPath: step.groupPath,
            status: wireStatus(step.status),
            queuedAt:
                step.startTime === undefined ? undefined : step.startTime - (step.queueTime ?? 0),
            startedAt: step.startTime,
            endedAt: step.endTime,
            queueTime: step.queueTime,
            waitTime: step.waitTime,
            executionTime: step.executionTime,
            duration: step.duration,
            dependencies: [...step.dependencies],
            dependents: [...step.dependents],
            assertions: step.assertions ?? {total: 0, threw: 0},
            assertionLog: step.assertionLog?.map(assertionModel),
            progress: step.progress,
            ...projectedResult,
            error: step.error
                ? {
                      message: step.error.message,
                      stack: step.error.stack,
                      context: step.error.context,
                  }
                : undefined,
            sourceLocation: pointer(step.sourceLocation ?? firstAssertionSource),
        };
    }
    const edgeList: ITestEdgeModel[] = [...base.edges];
    for (const edge of graph.edges) {
        const model = edgeModel(edge, base);
        if (!edgeList.some(item => item.id === model.id)) edgeList.push(model);
    }
    const run = deriveTestRun({
        ...base,
        status:
            progress.status === 'failed'
                ? 'failed'
                : progress.status === 'completed'
                  ? 'completed'
                  : progress.status === 'running'
                    ? 'running'
                    : 'pending',
        startedAt: progress.startTime || base.startedAt,
        endedAt: progress.endTime,
        order: base.order
            .filter(name => steps[name])
            .concat(Object.keys(steps).filter(name => !base.order.includes(name))),
        steps,
        edges: edgeList,
        counts: {total: 0, pending: 0, running: 0, completed: 0, failed: 0},
        assertions: progress.assertions ?? {total: 0, threw: 0},
        criticalPath: latency.criticalPath,
    });
    return {...run, counts: countsOf(run)};
}
