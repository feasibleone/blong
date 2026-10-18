/* eslint-disable @typescript-eslint/no-explicit-any -- the framework packages export TypeScript
   sources, so the test-only runner loads them through a runtime specifier and keeps the types local. */
/**
 * In-process runner for server-hosted test scenarios.
 *
 * The browser polls this controller's registry; the executor runs here, where the steps and the
 * server-only handlers they call live. Every poll page carries the projected model as a
 * `run:snapshot`, so the browser needs no server-side projection of its own.
 */
export interface IResolvedTestRun {
    method: string;
    name: string;
    steps: any[];
    $meta: Record<string, unknown>;
}

export class TestRunController {
    private readonly chainSpecifier = '@feasibleone/blong-chain';
    private readonly projectionSpecifier = '@feasibleone/blong-browser/testRun.ts';
    private registry?: any;
    private projection?: {
        pendingBrowserRun: (options: any) => any;
        projectBrowserRun: (base: any, progress: any, graph: any, latency: any) => any;
    };
    private readonly models = new Map<string, any>();
    private readonly cancelled = new Set<string>();

    private async load(): Promise<void> {
        if (this.registry) return;
        const chain = await import(this.chainSpecifier);
        const projection = await import(this.projectionSpecifier);
        this.registry = new chain.TestRunRegistry({ttlMs: 600_000, maxEvents: 2000});
        this.projection = projection as typeof this.projection;
    }

    async start({
        method,
        name,
        steps,
        $meta,
    }: IResolvedTestRun): Promise<{runId: string; run: any}> {
        await this.load();
        const {TestExecutor} = await import(this.chainSpecifier);
        const pending = this.projection!.pendingBrowserRun({name, method, steps});
        const runId = pending.runId;
        const running = {...pending, host: 'server', status: 'running'};
        this.registry!.start(method, running, runId);
        this.models.set(runId, running);

        const executor = new TestExecutor();
        const project = (): any => {
            const run = {
                ...this.projection!.projectBrowserRun(
                    this.models.get(runId) ?? running,
                    executor.getProgress(),
                    executor.getDependencyGraph(),
                    executor.getLatencyReport(),
                ),
                host: 'server',
            };
            this.models.set(runId, run);
            return run;
        };
        const snapshot = (): void => {
            if (this.cancelled.has(runId)) return;
            this.registry!.append(runId, {kind: 'run:snapshot', cursor: 0, run: project()});
        };

        executor.on('step:start', snapshot);
        executor.on('step:end', snapshot);
        executor.on('step:error', snapshot);
        executor.on('step:dependency', snapshot);
        executor.on('test:end', () => {
            if (this.cancelled.has(runId)) return;
            const run = project();
            this.registry!.append(runId, {kind: 'run:end', cursor: 0, run});
            this.registry!.end(runId, run.status === 'failed' ? 'failed' : 'completed', run);
        });

        void executor.execute(steps, $meta).catch(() => {
            // `test:end` carries the failed model; nothing here may reject the async run.
        });

        return {runId, run: running};
    }

    events(runId: string, cursor = -1): any {
        return this.registry!.find(runId, cursor);
    }

    snapshot(runId: string): any {
        return this.registry!.snapshot(runId);
    }

    cancel(runId: string): void {
        this.cancelled.add(runId);
        const model = this.models.get(runId);
        this.registry!.cancel(
            runId,
            model ? {...model, status: 'failed', error: {message: 'Run cancelled'}} : undefined,
        );
    }
}

export const testRunController = new TestRunController();
