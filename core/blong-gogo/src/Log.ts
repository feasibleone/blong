import {withProgress} from '@feasibleone/blong-lib';
import {Internal, type ICallLog, type ILog, type ILogger} from '@feasibleone/blong/types';
import {createCallChannel} from '@feasibleone/semantic-log/capability';
import {callerSite, messageMatches} from '@feasibleone/semantic-log/emitter';
import {pino, type Logger, type LoggerOptions, type TransportSingleOptions} from 'pino';
import {monotonicFactory} from 'ulidx';
import {callRecord, configureCallTrace, type CallTraceConfig} from './callTrace.ts';
import type {CacacheTransportOptions} from './pino-cacache.js';

// echo -e "\u001B]8;;https://google.com\u001B\\Кликни тук\u001B]8;;\e\\"

export interface LogConfig extends LoggerOptions {
    /**
     * Which implementation is active. This class serves every value except
     * `semantic`, so it never acts on the key — it is declared because the merged
     * `log` config is handed to whichever implementation the loader chose, and
     * stripped before the rest reaches pino.
     */
    impl?: string;
    /** The semantic implementation's store. Not a pino option; stripped below. */
    cache?: unknown;
    /**
     * Put the `semlog://` reference group at the end of a human line — the
     * pretty printer renders it, and this implementation has no other way to
     * show one. Not a pino option; stripped below. On by default, off in a
     * released process (`log.refs: false`), whose stdout nobody resolves a
     * reference from.
     */
    refs?: boolean;
    /**
     * The messages whose caller is worth naming — `log.callSite`.
     *
     * Each entry is a regular expression source, so a substring (`unauthorized`, `adapter.ready`)
     * is written as one and `['']` names the caller of every record. The semantic implementation
     * reads the same list, so one entry places an unexplained line whichever logger a process
     * chose, and nothing is captured for a message that matches none of the patterns.
     */
    callSite?: string | string[];
    /**
     * The call channel: whether a flow's calls are recorded, and whether they
     * are shown.
     *
     * `stdout` is the whole switch under this implementation, because pino has
     * no retention store and no cluster sink - a record it is not printing does
     * not exist. The framework's `enabled`/`off` decision still applies first,
     * so a flow that opted out records nothing whichever logger runs.
     */
    calls?: CallTraceConfig;
    /** When provided, log entries are cached to disk via cacache for later inspection. */
    cacache?: CacacheTransportOptions;
}

const ulid = monotonicFactory();

/**
 * The files a pino record's stack runs through before it reaches the call site.
 *
 * This module's own frames — the hook that asks for the site, since it runs inside pino's write
 * path — and pino's, which are between that hook and the caller. Everything else is the call site.
 */
const PINO_FRAME = /[\\/](?:Log|semantic-log|pino|thread-stream)[\\/.]/;

const ignoreArgPatterns = [
    '--tls-cipher-list=',
    '--v8-pool-size=',
    '--trace-event-file-pattern=',
    '--secure-heap-min=',
    '--node-snapshot',
    '--use-largepages=',
    '--secure-heap=',
    '--stack-trace-limit=',
];
// Pino transports run in worker threads. When the entry-point is ESM,
// `require.main` is undefined in CommonJS modules (including pino's transport
// loader). Pino interprets this as a "preload phase" and resets the worker's
// execArgv to [], stripping the TypeScript loader.  We work around this by
// explicitly forwarding process.execArgv so the TypeScript loader is available
// inside the transport worker thread.
//
// However, when the process is started under `tap` (e.g. `blong-dev test`),
// process.execArgv contains tap's own `--import` hooks (@tapjs/typescript →
// pirates/ts-node). Those hooks intercept `.ts` loads in the worker and bypass
// Node's native type stripping, which fails on `import type` constructs
// (SyntaxError: Unexpected identifier 'PinoPretty' in pino-pretty.ts). So we
// drop tap's hooks from the worker execArgv.
//
// Dropping the hooks alone is not enough: pino's multi-target transport loads
// `.ts`/`.cts` targets with `realRequire()` (CJS require, relying on ts-node),
// which fails regardless of execArgv. We therefore point both transports at
// tiny `.mjs` shims (pino-pretty.mjs / pino-cacache.mjs) that re-export the
// `.ts` modules. Pino then treats them as non-TypeScript targets and loads
// them with `realImport()` (dynamic ESM import), where Node's native type
// stripping handles the re-exported `.ts` — in both tap and normal dev runs.
const WORKER_OPTS = {
    execArgv: process.execArgv.filter(
        arg =>
            !ignoreArgPatterns.some(pattern => arg.startsWith(pattern)) &&
            !(arg.startsWith('--import=') && arg.includes('@tapjs')),
    ),
};

const PRETTY_TRANSPORT = (refs?: boolean): TransportSingleOptions<Record<string, unknown>> => ({
    target: './pino-pretty.mjs' as const,
    worker: WORKER_OPTS,
    options: {
        singleLine: true,
        colorizeObjects: true,
        // The reference group is the printer's to render, so the switch travels
        // with the transport the process chose.
        refs,
        // No `ignore` here: what the header already printed is the printer's own knowledge, and it
        // lives beside the header that prints it (`pino-pretty.ts` → `ALREADY_IN_HEADER`). It used to
        // be a list in this file, and an entry per envelope member meant the emptied
        // `{"$meta":{}}` was printed instead of the two members it had dropped.
    },
});

export default class Log extends Internal implements ILog {
    #logger: Logger;
    #config: LogConfig = {
        level: 'info',
        transport: PRETTY_TRANSPORT(),
    };

    public constructor(config: LogConfig) {
        super();
        this.merge(this.#config, config);
        configureCallTrace(this.#config.calls);
        // The printer renders the reference group, so the switch has to be known
        // before the transport is built — the default above is there for a caller
        // that never merges a config at all.
        this.#config.transport = PRETTY_TRANSPORT(this.#config.refs);

        // Inject a monotonic ULID `id` into every log entry before it reaches any transport

        if (this.#config.cacache) {
            this.#config.mixin = () => ({id: ulid()});
            // Multi-target transport: pretty console + cacache storage
            const cacacheOptions = this.#config.cacache;
            this.#config.transport = {
                targets: [
                    PRETTY_TRANSPORT(this.#config.refs),
                    {
                        target: './pino-cacache.mjs',
                        worker: WORKER_OPTS,
                        options: cacacheOptions,
                    },
                ],
            };
        }

        // Remove the framework's own keys before passing the rest to pino — none
        // of them is a pino option. `impl` chose this implementation (reaching
        // here means it is not `semantic`) and `cache` configures the semantic
        // implementation's store; `cacache` is this implementation's transport
        // and is passed to it separately, through the transport targets below.
        const {
            cacache: _cacacheConfig,
            impl: _impl,
            cache: _semanticCache,
            refs: _refs,
            callSite: _callSite,
            calls: _calls,
            ...pinoConfig
        } = this.#config;
        this.#logger = pino(pinoConfig);
    }

    /**
     * Attach the call channel's scope.
     *
     * Nothing to attach: the ambient scope a capability is carried in is
     * semantic-log's own (`AsyncLocalStorage`), reached by the vocabulary the
     * server bootstrap attaches, and the channel reads it directly.
     */
    public async init(): Promise<void> {}

    public child<T extends string>(...params: Parameters<Logger<never>['child']>): Logger<T> {
        return this.#logger.child(...params) as Logger<T>;
    }

    public logger(
        level: LoggerOptions['level'] = this.#config.level,
        bindings: object,
    ): ReturnType<ILog['logger']> {
        const child = this.#logger.child(bindings, {level});
        // The caller of the messages `log.callSite` names. pino has no hook that sees a message:
        // `logMethod` is not inherited by a child, and a formatter is handed the fields without
        // the text — so the match is made here, where the framework builds the logger it hands
        // out, and every component's logger is covered by construction.
        const locations =
            typeof this.#config.callSite === 'string'
                ? [this.#config.callSite]
                : this.#config.callSite;
        const bind = <A extends unknown[]>(
            method: (...args: A) => void,
        ): ((...args: A) => void) => {
            if (!locations?.length) return method;
            return (...args: A) => {
                const call = [...args] as unknown[];
                // The message is whichever argument is text: pino's order is `(bag, message)` or
                // `(message, values)`, and the text is the part both of those have.
                const message = [...call].reverse().find(arg => typeof arg === 'string');
                if (message !== undefined && messageMatches(locations, message)) {
                    // The site has to sit where pino looks for fields, which is the *first*
                    // argument: an object after the message is a printf value, and pino drops one
                    // the message has no placeholder left for. A call that already leads with a
                    // bag keeps it, and the site joins it.
                    const leading = call[0];
                    if (leading && typeof leading === 'object' && !Array.isArray(leading)) {
                        call[0] = {...(leading as object), site: callerSite(PINO_FRAME)};
                    } else {
                        call.unshift({site: callerSite(PINO_FRAME)});
                    }
                }
                return (method as (...args: unknown[]) => void)(...call);
            };
        };
        const result: ILogger = {
            trace: undefined,
            debug: undefined,
            info: undefined,
            warn: undefined,
            error: undefined,
            fatal: undefined,
        };
        switch (level) {
            case 'trace':
                result.trace = bind(child.trace.bind(child));
            case 'debug':
                result.debug = bind(child.debug.bind(child));
            case 'info':
                result.info = bind(child.info.bind(child));
            case 'warn':
                result.warn = bind(child.warn.bind(child));
            case 'error':
                result.error = bind(child.error.bind(child));
            case 'fatal':
                result.fatal = bind(child.fatal.bind(child));
        }
        return {
            ...result,
            progress: (label, promise, options) => withProgress(result, label, promise, options),
            calls: this.#callsChannel(child),
        };
    }

    /**
     * The framework's own account of the calls made through this log.
     *
     * Written through the logger it is asked of, so a component's call records carry
     * the component — the same `name` binding every other record from it does. Under
     * pino the destination *is* the level: there is nothing to store, so a call
     * record that is not printed has nowhere else to go. Whether the flow records at
     * all is the capability's decision, asked before the writer is called, and it is
     * the same one the semantic implementation asks.
     */
    #callsChannel(child: Logger): ICallLog {
        return createCallChannel(({leg, phase, message, error, fields}) => {
            child.info(
                {
                    ...callRecord(leg, phase),
                    ...(error === undefined ? {} : {err: error}),
                    ...fields,
                },
                message,
            );
        });
    }

    /** The call channel, as a component that holds the log rather than a logger reaches it. */
    public get calls(): ICallLog {
        return this.#callsChannel(this.#logger);
    }
}
