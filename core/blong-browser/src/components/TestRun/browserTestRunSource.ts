/**
 * A browser-local run source.
 *
 * The host resolves the scenario (a `browser/test` group) from the local registry and hands its
 * step array here. The executor runs in this page; no server runner and no polling are involved.
 * The source projects the executor's progress into the console's wire model and emits the same
 * event kinds a replay does, so `TestRun` does not know which source it is watching.
 */
import {TestExecutor} from '@feasibleone/blong-chain/browser.ts';
import {sanitizeResult} from './testRunProjection.ts';
import type {
    IAssertion,
    IDependencyEdge,
    IDependencyGraph,
    IMeta,
    IStepProgress,
    ITestLatency,
    ITestProgress,
    StepArray,
} from '@feasibleone/blong-chain/browser.ts';
import type {
    ITestAssertionModel,
    ITestEdgeModel,
    ITestRunEvent,
    ITestRunModel,
    ITestRunSource,
    ITestSourcePointer,
    ITestStepModel,
} from '../../types/testRun.js';
import {deriveTestRun, reduceTestRunEvent} from './testRunModel.ts';

export interface IBrowserTestRunOptions {
    /** Display name of the scenario, e.g. `session flow browser`. */
    name: string;
    /** Wire name of the group, e.g. `test.session.flow`. */
    method: string;
    /** The resolved step array; the host owns the registry lookup. */
    steps: StepArray;
    /** Forwarded to every step; usually the logged-in user's meta. */
    $meta?: IMeta;
    concurrency?: number;
    /** Provenance of the source file, shown in the details panel. */
    source?: {file?: string};
    /** Override the browser assert (for a host that owns a richer one). */
    assert?: ITestExecutorConfigAssert;
}

/** The assert slot of the executor config, without importing node-only types. */
type ITestExecutorConfigAssert = NonNullable<
    NonNullable<ConstructorParameters<typeof TestExecutor>[0]>['assert']
>;

let runCounter = 0;

const wireStatus = (status: IStepProgress['status']): ITestStepModel['status'] => status;

function pointer(source: IStepProgress['sourceLocation']): ITestSourcePointer | undefined {
    return source
        ? {file: source.file, line: source.line, column: source.column}
        : undefined;
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
            stepModels(group, [...groupPath, group.name ?? `group-${groupPath.length}`], order, map);
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

/** The pending model a run starts from, with declaration order preserved. */
export function pendingBrowserRun(options: IBrowserTestRunOptions): ITestRunModel {
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

/**
 * Project the executor's current progress into the console's model.
 *
 * The graph is merged with the edges the model already received from `step:dependency`: the
 * executor builds its final graph at the end of a successful run, and a failing run never gets
 * there, while the live edges are already known.
 */
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
                step.startTime === undefined
                    ? undefined
                    : step.startTime - (step.queueTime ?? 0),
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
        order: base.order.filter(name => steps[name]).concat(
            Object.keys(steps).filter(name => !base.order.includes(name)),
        ),
        steps,
        edges: edgeList,
        counts: {total: 0, pending: 0, running: 0, completed: 0, failed: 0},
        assertions: progress.assertions ?? {total: 0, threw: 0},
        criticalPath: latency.criticalPath,
    });
    return {...run, counts: countsOf(run)};
}

/**
 * Run a scenario in the page.
 *
 * `start()` resolves when the run ends, whether it passed or failed; the failure is in the model
 * and in the emitted `step:error`/`run:end` events, not in a rejected promise that would crash the
 * page.
 */
export class BrowserTestRunSource implements ITestRunSource {
    private readonly initial: ITestRunModel;
    private readonly executor: TestExecutor;
    private model: ITestRunModel;
    private listeners = new Set<(event: ITestRunEvent) => void>();
    private started = false;
    private finished = false;

    constructor(private readonly options: IBrowserTestRunOptions) {
        this.initial = pendingBrowserRun(options);
        this.model = this.initial;
        this.executor = new TestExecutor({
            concurrency: options.concurrency,
            assert: options.assert,
        });
    }

    snapshot(): ITestRunModel {
        return this.model;
    }

    subscribe(listener: (event: ITestRunEvent) => void): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    private emit(event: ITestRunEvent): void {
        this.model = reduceTestRunEvent(this.model, event);
        for (const listener of this.listeners) listener(event);
    }

    private stepEvent(
        kind: 'step:start' | 'step:end' | 'step:error',
        name: string,
    ): void {
        const step = this.executor.getProgress().steps.get(name);
        if (!step) return;
        const projected = projectBrowserRun(
            this.model,
            this.executor.getProgress(),
            this.executor.getDependencyGraph(),
            this.executor.getLatencyReport(),
        );
        const model = projected.steps[name];
        if (!model) return;
        const edges = projected.edges.filter(edge => edge.from === name);
        const event: ITestRunEvent =
            kind === 'step:error'
                ? {
                      kind,
                      cursor: 0,
                      step: model,
                      counts: projected.counts,
                      assertions: projected.assertions,
                  }
                : kind === 'step:end'
                  ? {
                        kind,
                        cursor: 0,
                        step: model,
                        counts: projected.counts,
                        assertions: projected.assertions,
                    }
                  : {
                        kind,
                        cursor: 0,
                        step: model,
                        counts: projected.counts,
                        assertions: projected.assertions,
                        edges,
                    };
        this.model = projected;
        for (const listener of this.listeners) listener(event);
    }

    private finish(progress: ITestProgress): void {
        if (this.finished) return;
        this.finished = true;
        const run = projectBrowserRun(
            this.model,
            progress,
            this.executor.getDependencyGraph(),
            this.executor.getLatencyReport(),
        );
        this.model = run;
        const event: ITestRunEvent = {kind: 'run:end', cursor: 0, run};
        for (const listener of this.listeners) listener(event);
    }

    async start(): Promise<void> {
        if (this.started) return;
        this.started = true;
        this.model = deriveTestRun({...this.initial, status: 'running', startedAt: Date.now()});
        this.emit({kind: 'run:start', cursor: 0, run: this.model});

        this.executor.on('step:start', name => this.stepEvent('step:start', name));
        this.executor.on('step:end', name => this.stepEvent('step:end', name));
        this.executor.on('step:error', name => this.stepEvent('step:error', name));
        this.executor.on('step:dependency', edge => {
            const model = edgeModel(edge, this.model);
            this.model = {
                ...this.model,
                edges: this.model.edges.some(item => item.id === model.id)
                    ? this.model.edges
                    : [...this.model.edges, model],
            };
            const event: ITestRunEvent = {kind: 'step:dependency', cursor: 0, edges: [model]};
            for (const listener of this.listeners) listener(event);
        });
        this.executor.on('test:end', progress => this.finish(progress));

        try {
            await this.executor.execute(this.options.steps, this.options.$meta ?? {});
        } catch {
            // `test:end` carries the failed model; the page must not receive a rejected run.
        }
        this.finish(this.executor.getProgress());
    }

    stop(): Promise<void> {
        this.executor.removeAllListeners();
        this.listeners.clear();
        return Promise.resolve();
    }
}
