/**
 * A cursor-polling source for a server-hosted run.
 *
 * A server-hosted run lives where its steps are; the page reads its event log from a cursor and
 * reduces it with the same reducer the replay and the browser-local source use. The transport is
 * the host's: the component never builds a URL or names a method itself.
 */
import type {IMeta} from '@feasibleone/blong-chain/browser.ts';
import type {ITestRunEvent, ITestRunModel, ITestRunSource} from '../../types/testRun.js';
import {reduceTestRunEvent} from './testRunModel.js';

export interface ITestRunEventPage {
    /** Events after the cursor, in cursor order. */
    events: Array<{cursor: number; event: ITestRunEvent}>;
    /** True once the run reached `run:end`; a final empty page is allowed. */
    done: boolean;
}

export interface ITestRunServerTransport {
    /** Start the run and return its initial model (usually `run:start`'s model). */
    start(method: string, $meta: IMeta): Promise<{runId: string; run: ITestRunModel}>;
    /** Read the events after `cursor`. */
    events(runId: string, cursor: number): Promise<ITestRunEventPage>;
    /** A full snapshot, used when the event page cannot be reduced. */
    snapshot(runId: string): Promise<ITestRunModel>;
    cancel(runId: string): Promise<void>;
}

export interface IPollingTestRunOptions {
    transport: ITestRunServerTransport;
    method: string;
    $meta?: IMeta;
    /** How long to wait between empty pages (default 250 ms). */
    pollIntervalMs?: number;
}

export class PollingTestRunSource implements ITestRunSource {
    private readonly transport: ITestRunServerTransport;
    private readonly method: string;
    private readonly $meta: IMeta;
    private readonly pollIntervalMs: number;
    private listeners = new Set<(event: ITestRunEvent) => void>();
    private model: ITestRunModel | undefined;
    private runId: string | undefined;
    /** -1 so a server whose first event cursor is 0 is not skipped. */
    private cursor = -1;
    private started = false;
    private stopped = false;
    private wake: (() => void) | undefined;

    constructor({transport, method, $meta = {}, pollIntervalMs = 250}: IPollingTestRunOptions) {
        this.transport = transport;
        this.method = method;
        this.$meta = $meta;
        this.pollIntervalMs = pollIntervalMs;
    }

    snapshot(): ITestRunModel {
        if (!this.model) throw new Error('the run has not started');
        return this.model;
    }

    subscribe(listener: (event: ITestRunEvent) => void): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    private emit(event: ITestRunEvent): void {
        if (this.model) this.model = reduceTestRunEvent(this.model, event);
        for (const listener of this.listeners) listener(event);
    }

    private wait(): Promise<void> {
        return new Promise(resolve => {
            const id = setTimeout(() => {
                this.wake = undefined;
                resolve();
            }, this.pollIntervalMs);
            this.wake = () => {
                clearTimeout(id);
                this.wake = undefined;
                resolve();
            };
        });
    }

    private async poll(): Promise<void> {
        while (!this.stopped && this.runId) {
            const page = await this.transport.events(this.runId, this.cursor);
            for (const entry of page.events) {
                if (entry.cursor <= this.cursor) continue;
                this.cursor = entry.cursor;
                this.emit(entry.event);
            }
            if (page.done) return;
            await this.wait();
        }
    }

    async start(): Promise<void> {
        if (this.started) return;
        this.started = true;
        try {
            const {runId, run} = await this.transport.start(this.method, this.$meta);
            this.runId = runId;
            this.model = run;
            this.emit({kind: 'run:start', cursor: 0, run});
            await this.poll();
        } catch (reason) {
            if (this.model) {
                this.model = {
                    ...this.model,
                    status: 'failed',
                    error: {message: (reason as Error)?.message ?? String(reason)},
                };
                this.emit({kind: 'run:end', cursor: this.cursor, run: this.model});
            }
        }
    }

    async cancel(): Promise<void> {
        this.stopped = true;
        this.wake?.();
        if (this.runId) await this.transport.cancel(this.runId);
    }

    stop(): Promise<void> {
        this.stopped = true;
        this.wake?.();
        this.listeners.clear();
        return Promise.resolve();
    }
}
