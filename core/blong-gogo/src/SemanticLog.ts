/**
 * The framework's server-side logger, backed by `@feasibleone/semantic-log`.
 *
 * It is the alternative to `Log` (pino) and implements the same `ILog` contract,
 * so `Internal`'s `this.log`, `api.createLog` and every existing call site are
 * unaffected by which one is selected. The emitter's own log — construction, one
 * logger per component, retention, the cluster sink and the lifecycle — is
 * `LogBase` in `@feasibleone/semantic-log/emitter`; what is left here is what is
 * blong's, and there are three things:
 *
 * - **The envelope.** The framework's call sites pass `{$meta: {mtid, method}}`,
 *   and its call records carry the same envelope (`callTrace.ts`), so both are
 *   read here — an envelope is not something semantic-log could know about.
 * - **The level contract.** `logger(level, bindings)` binds *downwards*: the
 *   original implementation uses a switch with no `break`s, so asking for `info`
 *   binds `info` through `fatal` and leaves `trace`/`debug` undefined. Call sites
 *   depend on that: a `this.log?.debug?.()` at info level is a silent no-op rather
 *   than a call. `ILog.logger` also promises `progress`, which is blong-lib's.
 * - **The call gate.** Whether a flow records its calls is the framework's
 *   configuration and its `blong grant` tokens (`callTrace.ts`), read at the
 *   boundary that mints a flow rather than here.
 *
 * ## Why this *holds* a base rather than extending one
 *
 * `LogBase` is what blong would extend, except that it cannot: the loader decides
 * that a module is a component by testing `prototype instanceof Internal`
 * (`load.ts`), and semantic-log's side of the world knows nothing of `Internal` —
 * nor should it. So the framework's class extends `Internal` as every other
 * component does, and delegates to a `LogBase` it owns. The hooks the base would
 * otherwise ask a subclass for are options, which is what makes that possible.
 *
 * The emitter is reached through `@feasibleone/semantic-log/emitter`, not the
 * package root: the root re-exports the cluster service, which imports `fastify`,
 * and this module is on a path `loadBrowser.ts` shares. Keeping the service out of
 * the import graph is what stops a browser bundle from trying to resolve a server
 * HTTP framework.
 *
 * ## `fatal` does not exit
 *
 * The emitter's `fatal` writes a record and then calls `exit`, because its own
 * process-failure hooks install it that way. The framework's `fatal` has always
 * meant "log this at fatal level" — pino ends nothing — and `LogBase` leaves `exit`
 * a no-op for exactly that reason. Installing the emitter's failure capture is a
 * separate decision, and not one this class makes for every process that logs.
 */

import {merge, withProgress} from '@feasibleone/blong-lib';
import {Internal, type ICallLog, type ILog, type ILogger} from '@feasibleone/blong/types';
import {
    LogBase,
    resolveHome,
    type ClusterOptions,
    type Format,
    type LevelName,
    type LoggerFace,
    type PayloadStore,
    type RecordStore,
    type RetentionOptions,
} from '@feasibleone/semantic-log/emitter';
import type {Level, Logger as PinoLogger} from 'pino';
import {callRecord, configureCallTrace, type CallTraceConfig} from './callTrace.ts';
import {toLogCall} from './semanticRecord.ts';

export {resolveHome};

/**
 * The threshold's type, taken from the contract rather than from pino.
 *
 * `ILog.logger`'s first parameter is pino's level, and the framework's own type
 * file imports that name without re-exporting it — so the parameter is named
 * through the interface that owns it, as `types.ts` itself does elsewhere.
 */
type LogLevel = Parameters<ILog['logger']>[0];

/** What a suite or realm may configure under `log` when `impl` is `semantic`. */
export interface SemanticLogConfig {
    /** Threshold. Records below it are not emitted at all. */
    level?: LogLevel;
    /** `human` (one readable line) or `json` (one JSON object per record). */
    format?: Format;
    /** ANSI colour in human format. Opt-in, as the emitter's own option is. */
    color?: boolean;
    /** The service name carried on every record; the framework's own by default. */
    service?: string;
    /**
     * Retain records on disk so a printed reference resolves later. The directory is
     * the framework's log cache, which the pino transport also writes — one store,
     * shared, so a `semantic-log://record/<id>` reference resolves whichever
     * implementation emitted it.
     */
    cache?: RetentionOptions;
    /**
     * The call channel: the framework's own account of the calls this process
     * makes and answers, and the switch that decides whether it is produced.
     *
     * `enabled` and `off` are the framework's decision (see `callTrace.ts`) —
     * `off` names the entry methods whose flows are too frequent to record. This
     * implementation adds `stdout`: the call records reach the retention store
     * and the cluster service whether or not it is set, and setting it is what
     * puts them on a terminal as well.
     */
    calls?: CallTraceConfig;
    /**
     * The semantic-log cluster service: where records go to be assembled into
     * templates, flows, diagrams and incidents. `LogBase` owns what each field
     * means — the framework's own concern here is only that a development run may
     * start one and a deployment may point at one.
     */
    cluster?: ClusterOptions;
}

/**
 * A pino level, as an emitter threshold.
 *
 * pino's vocabulary has one name the emitter does not: `silent`. It means "no
 * records at all", which is a threshold above every level, so it is translated
 * rather than passed through — a component configured silent must not fall back
 * to the root's threshold and start emitting again, which is exactly what
 * happened while `child` ignored this option.
 */
function thresholdOf(level: Level | 'silent' | number | undefined): LevelName | number | undefined {
    if (level === undefined) return undefined;
    return level === 'silent' ? Number.POSITIVE_INFINITY : (level as LevelName | number);
}

export default class SemanticLog extends Internal implements ILog {
    #config: SemanticLogConfig;
    #base: LogBase;

    public constructor(config: SemanticLogConfig) {
        super();
        const merged = merge<SemanticLogConfig>(
            {level: 'info' as LogLevel, format: 'human' as Format, color: false},
            config,
        ) as SemanticLogConfig;
        this.#config = merged;
        this.#base = new LogBase({
            service: merged.service ?? 'blong',
            level: thresholdOf(merged.level),
            format: merged.format,
            color: merged.color,
            cache: merged.cache,
            // Only the printing switch is the base's business; `enabled`/`off` are
            // the gate's, and are read where a flow is minted.
            calls: merged.calls,
            cluster: merged.cluster,
            // Lazy on purpose: this module is on a path the browser bootstrap shares,
            // and the service entry reaches `fastify`. A process with no cluster
            // configured never loads it at all.
            openCluster: async () =>
                (await import('@feasibleone/semantic-log/service')).openCluster,
            // The framework's envelope, on the record and on the call site's own
            // arguments: `{$meta: {mtid, method}}` is what its readers match on.
            envelope: ({leg, phase}) => callRecord(leg, phase),
            translate: args => toLogCall(args),
        });
    }

    /** What the emitter retains through, and how a retained record is read back. */
    public get store(): RecordStore & PayloadStore {
        return this.#base.store;
    }

    /**
     * The address of the cluster service this process started, once it started one.
     *
     * The framework publishes it to the components that read the service — the realm
     * whose pages ask it what it observed. It is the *bound* address rather than a
     * configured one because the port is asked for, not named: two framework
     * processes on one machine are ordinary (a dev server beside a test run, or CI
     * running packages in parallel) and a fixed port leaves the second one with no
     * service at all while its readers keep looking at the first one's.
     */
    public get clusterUrl(): string | undefined {
        return this.#base.clusterUrl;
    }

    /**
     * Install the call gate, then open the store and the cluster.
     *
     * The gate's configuration goes first: `enabled`/`off` decide whether a flow
     * records, and both are read where a flow is minted, which is before the store
     * can matter. The ambient scope the decision is carried in is semantic-log's
     * own, reached by the vocabulary the server bootstrap attaches, so there is
     * nothing to attach here.
     */
    public async init(): Promise<void> {
        configureCallTrace(this.#config.calls);
        await this.#base.init();
    }

    /** Flush and close everything the base opened. */
    public async stop(): Promise<void> {
        await this.#base.stop();
    }

    /**
     * A pino-shaped child logger, with pino's `silent` translated first.
     *
     * Everything else about the child — the bindings, the component's name, the
     * face — is the base's.
     */
    public child<T extends string>(
        ...params: Parameters<PinoLogger<never>['child']>
    ): PinoLogger<T> {
        const [bindings, options] = params as unknown as [
            Record<string, unknown> | undefined,
            {level?: Level | 'silent' | number} | undefined,
        ];
        const level = thresholdOf(options?.level);
        return this.#base.child(
            bindings,
            level === undefined ? undefined : {level},
        ) as unknown as PinoLogger<T>;
    }

    public logger(
        level: LogLevel = this.#config.level as LogLevel,
        bindings: object,
    ): ReturnType<ILog['logger']> {
        const {name, ...rest} = bindings as {name?: string};
        const face: LoggerFace = this.#base.componentFace(name, thresholdOf(level), rest);
        const result: ILogger = {
            trace: undefined,
            debug: undefined,
            info: undefined,
            warn: undefined,
            error: undefined,
            fatal: undefined,
        };
        // The fall-through is the contract, not an oversight: see the class
        // comment. Each case binds its own level and every one below it.
        switch (level) {
            case 'trace':
                result.trace = face.trace;
            case 'debug':
                result.debug = face.debug;
            case 'info':
                result.info = face.info;
            case 'warn':
                result.warn = face.warn;
            case 'error':
                result.error = face.error;
            case 'fatal':
                result.fatal = face.fatal;
        }
        return {
            ...result,
            progress: (label, promise, options) => withProgress(result, label, promise, options),
            calls: face.calls,
        };
    }

    /**
     * The framework's own account of the calls made through this log.
     *
     * Present on the log itself so a component that holds the log rather than a
     * child logger (`Gateway`) reaches the same channel as a port that holds
     * only its logger.
     */
    public get calls(): ICallLog {
        return this.#base.callsChannel(undefined);
    }
}
