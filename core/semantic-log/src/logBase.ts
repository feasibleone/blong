/**
 * The embedder's log: a runtime's logger, its retention and its cluster sink.
 *
 * A runtime that wants semantic-log's emitter does not want to assemble it: it
 * wants a log object that takes a small configuration, hands out a logger per
 * component, retains what it wrote, and can either run the cluster service in its
 * own process or point its sink at one that already runs. That object is this
 * class, and the runtime-specific parts of it are the hooks at the bottom of the
 * file: the record envelope, and the pino dialect a call site speaks.
 *
 * ## What is here, and what a subclass adds
 *
 * Here: the emitter's construction and its resolved options, one logger per
 * component (keyed by name *and* threshold, because the level is the emitter's own
 * switch), the retention cache and the store that reads back from it, the call
 * channel's plumbing, the cluster sink and the optional in-process service, and
 * the `init`/`stop` pair that opens and closes all of it in the right order.
 *
 * A subclass adds its vocabulary: the fields a record's envelope carries
 * ({@link LogBaseOptions.envelope}), how a call site's arguments are read
 * ({@link LogBaseOptions.translate}), and whatever its own interfaces require —
 * a runtime's `ILog` is its own type, so it decides which of the face's levels it
 * exposes and what else it hangs off the object. Both hooks are options rather
 * than overridable methods because a runtime may not be free to subclass: a
 * framework that identifies its components by their prototype has to be extended,
 * and its log then *holds* one of these instead — see blong's `SemanticLog`.
 *
 * ## Why a base class and not a factory
 *
 * The lifecycle is the reason: a runtime overrides `init` to do its own work
 * before the cache is opened, and `stop` to drain what it queued. Both halves are
 * asynchronous and both have an order that matters — the emitter queues its cache
 * writes, so a close on its own returns while the last records are still on their
 * way to a store that has already shut, which is what makes the records of the
 * last request before a shutdown the ones that go missing.
 *
 * ## Nothing here may fail a process
 *
 * A service whose port is taken, a module that will not load, a store that does
 * not answer: each is reported and dropped, and the sink stays unattached. A
 * record is never queued behind a service that was never started, and the log
 * itself works with no cache and no cluster at all — which is what a plain
 * `new LogBase()` is.
 */

import {homedir} from 'node:os';
import {join} from 'node:path';
import {openCache, type PayloadStore, type RecordCache, type RecordStore} from './cache.ts';
import {createCallChannel, type CallChannel, type CallEvent} from './capability.ts';
import type {LevelName} from './level.ts';
import {toLogCall as dialect, type LogCall} from './logCall.ts';
import type {Logger as SemanticLogger} from './logger.ts';
import {createLogger, type Format, type LoggerOptions} from './logger.ts';
import type {LogRecord} from './record.ts';
import {getWriter, type Writer} from './writer.ts';

/** Records retained when a cache is configured without a bound. */
export const DEFAULT_RETENTION_LIMIT = 10_000;

/** The retention store's configuration. */
export interface RetentionOptions {
    /** Directory holding the cache. Created if it does not exist. */
    dir: string;
    /** Records retained, and independently payloads. */
    limit?: number;
    /** How long a retention sweep is trusted for, in milliseconds. */
    sweepIntervalMs?: number;
}

/**
 * The cluster service: where records go to be assembled into templates, flows,
 * diagrams and incidents.
 *
 * `enabled` runs it inside this process, which is what a development run or a test
 * wants — the records stay where they were made and the run can be drawn from what
 * it accumulated. `url` points the sink at a service that already runs, which is
 * what a deployment does; both may be set, and then the sink follows `url` and
 * nothing is started. Neither set, no sink is installed: the process behaves
 * exactly as if the service did not exist, and nothing is lost by it — stdout and
 * the retention store are where a record lives first.
 *
 * The service itself is reached through {@link LogBaseOptions.openCluster}, because
 * the emitter's half of the package may not reach it — not even as a type: the
 * package's own `emitter-entry` test walks relative `.ts` specifiers out of the
 * emitter's entry, and `from './service/…'` is one whether or not it is erased. So
 * the shape of what a caller configures and what an opener answers with are both
 * declared here, and the service's side implements them (`service/cluster.ts`).
 */
export interface ClusterOptions {
    enabled?: boolean;
    /** The port to bind. `0` asks for a free one; the sink is given the URL either way. */
    port?: number;
    /** The interface to bind. Loopback by default: an aid, not a public service. */
    host?: string;
    /** An already-running service, by URL. */
    url?: string;
    /** How many undelivered batches may queue before the oldest is dropped. */
    sendLimit?: number;
    /** The service's snapshot file, when the template registry should survive a restart. */
    persistTo?: string;
}

/** The cluster sink, as this half of the package needs it: write, flush, count. */
export interface ClusterSink extends Writer {
    /** Resolve once every queued send has settled. Never rejects. */
    flush(): Promise<void>;
    /** How many records could not be delivered, cumulatively. */
    failed(): number;
}

/** The sink, and how to stop what was started for it. */
export interface OpenedCluster {
    /** Where records go. */
    sink: ClusterSink;
    /** Flush the sink and stop the service this process started, if it started one. */
    close: () => Promise<void>;
}

/**
 * Report a failure the cluster cannot report itself.
 *
 * `stage` says which half failed, because the two read differently to whoever is
 * looking: a service that was never started is a configuration or a busy port, and
 * a refused batch is a service that is up and unhappy.
 */
export type ClusterReporter = (error: unknown, stage: 'start' | 'send') => void;

/**
 * Open the cluster: the shape a log is handed.
 *
 * `undefined` means "not started" — never a throw — so a caller can treat it as
 * "no sink" without a failure of its own.
 */
export type ClusterOpener = (
    options: ClusterOptions,
    report: ClusterReporter,
) => Promise<OpenedCluster | undefined>;

/** The call channel's own switches, as far as the plumbing is concerned. */
export interface CallOptions {
    /**
     * Print the call records as well as storing them.
     *
     * Storing is not a switch: a call record reaches the retention store and the
     * cluster service either way, because that is what the diagrams are drawn
     * from. Whether a flow records at all is decided elsewhere — the emitter's
     * capability — and is not this.
     */
    stdout?: boolean;
}

/** What a runtime configures on its log. Every field has a defensible default. */
export interface LogBaseOptions {
    /** The service name carried on every record. */
    service?: string;
    /** Threshold. Records below it are not emitted at all. */
    level?: LevelName | number;
    /** `human` (one readable line) or `json` (one JSON object per record). */
    format?: Format;
    /** ANSI colour in human format. Opt-in, as the emitter's own option is. */
    color?: boolean;
    /** Retain records on disk so a printed reference resolves later. */
    cache?: RetentionOptions;
    /** The call channel. */
    calls?: CallOptions;
    /** The cluster service. */
    cluster?: ClusterOptions;
    /**
     * How the cluster service is reached, resolved lazily.
     *
     * Called once, at `init`, and only when a cluster is configured — so a runtime
     * passes a function that loads the service's module rather than the module
     * itself, and a process with no cluster never loads it. `@feasibleone/semantic-log/service`
     * exports the `openCluster` this is normally set to.
     *
     * Absent, a configured cluster installs no sink: a log that was never told how
     * to reach the service is a log with nowhere to send records, not an error.
     */
    openCluster?: () => Promise<ClusterOpener | undefined>;
    /**
     * The fields a call record carries, on top of the emitter's own.
     *
     * Called once per recorded call, before the record is written, and never for
     * a flow the capability turned off. The default contributes nothing: a call
     * record is a record like any other until a runtime says what its envelope is.
     */
    envelope?: (event: CallEvent) => Record<string, unknown>;
    /**
     * How a call site's arguments are read.
     *
     * The emitter's own dialect by default — every pino-shaped shape, translated
     * by `toLogCall` — and the hook a runtime uses to read an envelope of its own
     * out of the arguments as well. It is on every face, including the one handed
     * to a third party, which is what stops that third party logging a request
     * object straight into the emitter's message slot.
     */
    translate?: (args: unknown[]) => LogCall;
    /**
     * What the emitter's `fatal` ends with.
     *
     * A no-op by default, which is deliberately not the emitter's own choice: its
     * `exit` exists for the process-failure hooks it installs, and a record is not
     * a decision to end a process. A runtime that wants that behaviour passes one.
     */
    exit?: () => void;
}

/**
 * A pino-shaped view of an emitter logger.
 *
 * The emitter's methods take `(message, fields)`; pino's take `(bag, message)` in
 * either order and accept an `Error` or a bare string. Everything a runtime hands a
 * logger to — a web framework, its own request hooks — speaks the second dialect,
 * so this is the shape both a call site's logger and the logger given to a third
 * party have.
 */
export interface LoggerFace {
    trace: (...args: unknown[]) => void;
    debug: (...args: unknown[]) => void;
    info: (...args: unknown[]) => void;
    warn: (...args: unknown[]) => void;
    error: (...args: unknown[]) => void;
    fatal: (...args: unknown[]) => void;
    /** A face for a child of the same logger, with the given bindings. */
    child: (bindings: Record<string, unknown>) => LoggerFace;
    /** The runtime's call channel, for a component that holds this face. */
    calls: CallChannel;
}

/**
 * Expand a leading `~/` to the home directory.
 *
 * A configuration may name a directory that way — a pino transport expands it
 * itself, so a value left unexpanded would create a literal `~` beside the working
 * directory instead of sharing the cache.
 */
export function resolveHome(dir: string): string {
    return dir.startsWith('~/') ? join(homedir(), dir.slice(2)) : dir;
}

export class LogBase {
    /** The configuration this log was built with, defaulted. */
    public readonly config: LogBaseOptions;

    /**
     * The resolved emitter options, so a per-component logger can be built from
     * them and a caller can build its own on the same terms.
     */
    public readonly options: LoggerOptions;

    /** The emitter's root logger, bound to no component. */
    protected readonly logger: SemanticLogger;

    #cache?: RecordCache;

    /**
     * One emitter logger per component name and threshold.
     *
     * An emitter renders a record's header from its *logger's* `context` rather
     * than from a field of the record, so one logger per component is what it takes
     * for the header to name the component. They are few and memoised, and all of
     * them retain through the same store. Keyed by the level as well as the name:
     * the threshold is the emitter's own, so two callers wanting different ones
     * must not share a logger — the same component answering at `warn` and at
     * `debug` would otherwise silence one of them.
     */
    #contexts = new Map<string, SemanticLogger>();

    /**
     * One emitter logger per component for the *call* channel.
     *
     * The channel is reached through the logger a component already holds, so a
     * call record keeps naming the component it came from — the same `context` the
     * level records carry — while its destination stays its own.
     */
    #callContexts = new Map<string, SemanticLogger>();

    /**
     * Where a call record goes beside the store and the cluster sink.
     *
     * Printing is the opt-in; storing is not. The writer forwards to the
     * process-wide destination rather than holding stdout itself, because that
     * destination is the emitter's own seam — a test silences output by replacing
     * it, and a call record that ignored the replacement would be the one line no
     * test could collect. It is never `null` (a null primary silences the sinks with
     * it), so an unprinted call record still reaches the cluster.
     */
    #callsWriter: Writer = {
        write: (line: string, record?: LogRecord): void => {
            if (this.config.calls?.stdout !== true) return;
            getWriter()?.write(line, record);
        },
    };

    /**
     * The sink the logger is *built* with, so a record emitted before the cluster
     * is resolved still reaches it.
     *
     * Starting a service is asynchronous and the logger is not: the log is
     * constructed and immediately asked for child loggers, while binding a socket
     * takes a turn of the loop. A sink installed afterwards would miss every record
     * made before it existed — the startup ones — so the logger is given a sink
     * that forwards, and the forwarding is what becomes real. With no cluster
     * configured this is one no-op call per record.
     */
    #sink: Writer = {
        write: (line: string, record?: LogRecord): void => {
            this.#cluster?.write(line, record);
        },
    };

    /** The cluster sink, once a URL is known. */
    #cluster?: ClusterSink;

    /** How to stop what the opener started, when it started something. */
    #closeCluster?: () => Promise<void>;

    /**
     * What the emitter retains through — and how a caller reads back what was
     * retained.
     *
     * It delegates to the cache once it is open. Opening the cache is asynchronous
     * and the logger is not: the log is constructed and immediately asked for child
     * loggers, while `openCache` does I/O. A record emitted before the cache is open
     * is rendered and written to stdout exactly as any other — it is simply not
     * retained, which is the same state a cacheless logger is in for its whole
     * life.
     */
    public readonly store: RecordStore & PayloadStore = {
        put: async (record: LogRecord): Promise<void> => this.#cache?.put(record),
        putSync: (record: LogRecord): void => this.#cache?.putSync(record),
        get: async (id: string): Promise<LogRecord | undefined> => this.#cache?.get(id),
        stats: (): {size: number; dropped: number} => this.#cache?.stats() ?? {size: 0, dropped: 0},
        close: async (): Promise<void> => this.#cache?.close(),
        putPayload: async (id: string, time: number, json: string): Promise<void> =>
            this.#cache?.putPayload(id, time, json),
        putPayloadSync: (id: string, time: number, json: string): void =>
            this.#cache?.putPayloadSync(id, time, json),
        getPayload: async (id: string): Promise<unknown | undefined> => this.#cache?.getPayload(id),
        payloadStats: (): {size: number; dropped: number} =>
            this.#cache?.payloadStats() ?? {size: 0, dropped: 0},
    };

    public constructor(config: LogBaseOptions = {}) {
        this.config = config;
        this.options = {
            service: config.service ?? 'semantic-log',
            level: config.level,
            format: config.format,
            color: config.color,
            cache: this.store,
            payloads: this.store,
            // Beside stdout, never instead of it: the rendered line is what a person
            // and a terminal link read, and it stays the primary destination whatever
            // the cluster is doing.
            sinks: [this.#sink],
            exit: config.exit ?? ((): void => undefined),
        };
        this.logger = createLogger(this.options);
    }

    /**
     * The emitter logger for a component, created on first use.
     *
     * Both arguments are the emitter's own vocabulary: a threshold passed here is
     * already resolved, so a caller translating from a runtime's level names does
     * that translation itself.
     */
    public componentLogger(name?: string, level?: LevelName | number): SemanticLogger {
        if (name === undefined && level === undefined) {
            return this.logger;
        }
        const key = `${name ?? ''}|${level === undefined ? '' : String(level)}`;
        let context = this.#contexts.get(key);
        if (context === undefined) {
            context = createLogger({
                ...this.options,
                ...(name === undefined ? {} : {context: name}),
                ...(level === undefined ? {} : {level}),
            });
            this.#contexts.set(key, context);
        }
        return context;
    }

    /**
     * The call channel's logger for a component, created on first use.
     *
     * Always built at `info`, whatever the process threshold is: the call records
     * are written at that level, and they are *stored* rather than shown — a process
     * that shows only warnings still retains the calls, which is what the diagrams
     * are drawn from. Whether a flow records at all is checked before every write;
     * the threshold here is not a second, quieter switch.
     */
    public callsLogger(name?: string): SemanticLogger {
        const key = name ?? '';
        let logger = this.#callContexts.get(key);
        if (logger === undefined) {
            logger = createLogger({
                ...this.options,
                level: 'info',
                ...(name === undefined ? {} : {context: name}),
                writer: this.#callsWriter,
            });
            this.#callContexts.set(key, logger);
        }
        return logger;
    }

    /**
     * The call channel for a component.
     *
     * The gate and the phases are the emitter's own — one capability decides a flow,
     * and the phases are the call vocabulary — so what is left here is where a call
     * record goes, and the envelope is what {@link LogBaseOptions.envelope} adds. The gate is
     * asked before the writer is called, so a flow that opted out pays a scope read
     * and nothing else: no envelope is built and no record is retained.
     */
    public callsChannel(name: string | undefined): CallChannel {
        return createCallChannel(event => {
            const {message, error, fields} = event;
            this.callsLogger(name).info(message, {
                ...(this.config.envelope?.(event) ?? {}),
                ...(error === undefined ? {} : {err: error}),
                ...fields,
            });
        });
    }

    /**
     * A pino-shaped face on an emitter logger.
     *
     * The translation runs through {@link LogBaseOptions.translate}, so a runtime
     * that reads an envelope out of a call site's arguments gets it on every face —
     * including the one handed to a third party.
     */
    public face(child: SemanticLogger, name: string | undefined): LoggerFace {
        const methods = child as unknown as Record<
            keyof Omit<LoggerFace, 'child' | 'calls'>,
            (text: string, bag: Record<string, unknown>) => void
        >;
        const translate =
            (level: keyof Omit<LoggerFace, 'child' | 'calls'>) =>
            (...args: unknown[]): void => {
                const {msg, fields} = (this.config.translate ?? dialect)(args);
                methods[level].call(child, msg, fields);
            };
        return {
            trace: translate('trace'),
            debug: translate('debug'),
            info: translate('info'),
            warn: translate('warn'),
            error: translate('error'),
            fatal: translate('fatal'),
            child: (bindings: Record<string, unknown>): LoggerFace =>
                this.face(
                    child.child(bindings),
                    typeof bindings.name === 'string' ? bindings.name : name,
                ),
            calls: this.callsChannel(name),
        };
    }

    /**
     * The face for a component at a threshold, with the given bindings.
     *
     * The one call a runtime's `logger(level, bindings)` needs: everything else it
     * does with the result is its own interface's business.
     */
    public componentFace(
        name: string | undefined,
        level: LevelName | number | undefined,
        bindings: Record<string, unknown>,
    ): LoggerFace {
        return this.face(this.componentLogger(name, level).child(bindings), name);
    }

    /**
     * A pino-shaped child logger, with the level option honoured.
     *
     * The level is passed on rather than dropped, and it has to be: a runtime asks
     * for a `warn` child so that a request dump is not written unless it was asked
     * for, and an implementation that ignored the option would print those records
     * at the root's threshold instead. The level is the emitter's own — a runtime
     * translating pino's `silent`, which the emitter has no name for, does that
     * before calling.
     */
    public child(
        bindings?: Record<string, unknown>,
        options?: {level?: LevelName | number},
    ): LoggerFace {
        const {name, ...rest} = bindings ?? {};
        const component = typeof name === 'string' ? name : undefined;
        return this.face(this.componentLogger(component, options?.level).child(rest), component);
    }

    /**
     * Open the retention cache, and start the cluster service when asked to.
     *
     * A wrapper or a subclass calls this at the point its own order requires — a
     * runtime's switches are read where its flows are minted, so they have to be
     * installed before anything can be logged — and then this opens the store.
     */
    public async init(): Promise<void> {
        await this.#startCluster();
        const cache = this.config.cache;
        if (!cache?.dir) {
            return;
        }
        this.#cache = await openCache({
            dir: resolveHome(cache.dir),
            limit: cache.limit ?? DEFAULT_RETENTION_LIMIT,
            sweepIntervalMs: cache.sweepIntervalMs,
        });
    }

    /**
     * Point the cluster sink at the service, asking the opener the runtime supplied.
     *
     * Nothing here can fail the process: a service whose port is taken, a module that
     * will not load, an opener that is not configured at all — each leaves the sink
     * unattached, and a record is never queued behind a service that was never
     * started. The opener is resolved at this moment rather than at construction, so
     * a process with no cluster configured never loads the module that knows how to
     * reach one.
     */
    async #startCluster(): Promise<void> {
        const cluster = this.config.cluster;
        if ((!cluster?.enabled && !cluster?.url) || this.config.openCluster === undefined) {
            return;
        }
        const open = await this.config.openCluster();
        if (open === undefined) {
            return;
        }
        const opened = await open(cluster, (error: unknown, stage: 'start' | 'send'): void => {
            this.logger.warn(
                stage === 'start'
                    ? `the semantic-log cluster service was not started: ${String(error)}`
                    : `the semantic-log cluster service refused a batch: ${String(error)}`,
            );
        });
        if (opened === undefined) {
            return;
        }
        this.#cluster = opened.sink;
        this.#closeCluster = opened.close;
    }

    /**
     * Flush the emitter, then close the cache.
     *
     * Both halves are needed: the emitter queues its cache writes, so a `close` on
     * its own would return while the last records were still on their way to a store
     * that had already shut — which is what makes the records of the last request
     * before a shutdown the ones that go missing.
     */
    public async stop(): Promise<void> {
        // Every component's logger, not just the unnamed one: each has its own write
        // queue, and the last request's records sit in whichever of them the
        // component that answered it was bound to. The call channel's loggers are
        // separate loggers with their own queues, so they are flushed here too — the
        // calls of the last request are what completes its picture.
        await Promise.all(
            [this.logger, ...this.#contexts.values(), ...this.#callContexts.values()].map(logger =>
                logger.flush(),
            ),
        );
        // Then the cluster, while it is still up: the records of a shutdown are the
        // ones a drain loses, and the service is where they become a flow.
        await this.#closeCluster?.();
        await this.#cache?.close();
    }
}
