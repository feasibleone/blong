/**
 * In-memory registry for server-hosted test runs.
 *
 * A run is an append-only event list with a monotonic cursor, plus the latest snapshot. The browser
 * polls `find(runId, cursor)`; the registry never stores anything a reducer cannot rebuild from the
 * events. One active run per topic is the rule: starting a new run on a topic marks the old one
 * cancelled so two scenarios cannot write into the same stream by accident.
 *
 * It is deliberately free of handler or transport code so it can be unit-tested and reused by any
 * host. TTL and the event bound keep a long-lived process from growing without limit.
 */
export interface IRunEvent<Event = unknown> {
    cursor: number;
    event: Event;
}

export interface IRunEventPage<Event = unknown> {
    events: Array<IRunEvent<Event>>;
    /** True once the run reached a terminal status. */
    done: boolean;
}

export type TestRunState = 'running' | 'completed' | 'failed' | 'cancelled';

export interface ITestRunRegistryOptions {
    /** A finished run is forgotten after this long (default 10 minutes). */
    ttlMs?: number;
    /** The maximum number of events retained per run (default 1000). */
    maxEvents?: number;
    /** Clock override for tests. */
    now?: () => number;
}

interface IStoredRun<Snapshot, Event> {
    runId: string;
    topic: string;
    snapshot: Snapshot;
    events: Array<IRunEvent<Event>>;
    nextCursor: number;
    state: TestRunState;
    createdAt: number;
    updatedAt: number;
}

let runCounter = 0;

export class TestRunRegistry<Snapshot = unknown, Event = unknown> {
    private readonly ttlMs: number;
    private readonly maxEvents: number;
    private readonly now: () => number;
    private readonly runs = new Map<string, IStoredRun<Snapshot, Event>>();
    private readonly activeByTopic = new Map<string, string>();

    constructor({ttlMs = 600_000, maxEvents = 1000, now = Date.now}: ITestRunRegistryOptions = {}) {
        this.ttlMs = ttlMs;
        this.maxEvents = maxEvents;
        this.now = now;
    }

    /** Start a run, cancelling whatever was active on the topic. Returns the new run id. */
    start(topic: string, snapshot: Snapshot, runId?: string): string {
        this.prune();
        const previous = this.activeByTopic.get(topic);
        if (previous) this.cancel(previous);
        const id = runId ?? `run-${this.now()}-${runCounter++}`;
        const at = this.now();
        this.runs.set(id, {
            runId: id,
            topic,
            snapshot,
            events: [],
            nextCursor: 1,
            state: 'running',
            createdAt: at,
            updatedAt: at,
        });
        this.activeByTopic.set(topic, id);
        return id;
    }

    /** Append an event and return its cursor. A finished run keeps its final events. */
    append(runId: string, event: Event): number {
        const run = this.require(runId);
        const cursor = run.nextCursor++;
        run.events.push({cursor, event});
        if (run.events.length > this.maxEvents) {
            run.events.splice(0, run.events.length - this.maxEvents);
        }
        run.updatedAt = this.now();
        return cursor;
    }

    /** Events after `cursor`, oldest first, capped at `limit`. */
    find(runId: string, cursor = 0, limit = 200): IRunEventPage<Event> {
        const run = this.require(runId);
        return {
            events: run.events.filter(entry => entry.cursor > cursor).slice(0, limit),
            done: run.state !== 'running',
        };
    }

    snapshot(runId: string): Snapshot | undefined {
        return this.runs.get(runId)?.snapshot;
    }

    state(runId: string): TestRunState | undefined {
        return this.runs.get(runId)?.state;
    }

    /** Store the final snapshot and close the run. */
    end(runId: string, state: Exclude<TestRunState, 'running'>, snapshot?: Snapshot): void {
        const run = this.require(runId);
        run.state = state;
        if (snapshot !== undefined) run.snapshot = snapshot;
        run.updatedAt = this.now();
        if (this.activeByTopic.get(run.topic) === runId) this.activeByTopic.delete(run.topic);
    }

    cancel(runId: string, snapshot?: Snapshot): void {
        this.end(runId, 'cancelled', snapshot);
    }

    /** Forget runs whose last update is older than the TTL. */
    prune(at = this.now()): void {
        for (const [runId, run] of this.runs) {
            if (at - run.updatedAt <= this.ttlMs) continue;
            this.runs.delete(runId);
            if (this.activeByTopic.get(run.topic) === runId) this.activeByTopic.delete(run.topic);
        }
    }

    private require(runId: string): IStoredRun<Snapshot, Event> {
        const run = this.runs.get(runId);
        if (!run) throw new Error(`Unknown test run "${runId}"`);
        return run;
    }
}
