import {withProgress} from '@feasibleone/blong-lib';
import {Internal, type ICallLog, type ILog, type ILogger} from '@feasibleone/blong/types';
import {createCallChannel} from '@feasibleone/semantic-log/capability';
import {pino, type Logger, type LoggerOptions} from 'pino';
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

const PRETTY_TRANSPORT = {
    target: './pino-pretty.mjs',
    worker: WORKER_OPTS,
    options: {
        singleLine: true,
        colorizeObjects: true,
        ignore: [
            'context',
            'prefix',
            'pid',
            'hostname',
            '$meta.mtid',
            '$meta.method',
            'req',
            'res',
            'config',
            'configBase',
            'id',
        ].join(','),
    },
};

export default class Log extends Internal implements ILog {
    #logger: Logger;
    #config: LogConfig = {
        level: 'info',
        transport: PRETTY_TRANSPORT,
    };

    public constructor(config: LogConfig) {
        super();
        this.merge(this.#config, config);
        configureCallTrace(this.#config.calls);

        // Inject a monotonic ULID `id` into every log entry before it reaches any transport

        if (this.#config.cacache) {
            this.#config.mixin = () => ({id: ulid()});
            // Multi-target transport: pretty console + cacache storage
            const cacacheOptions = this.#config.cacache;
            this.#config.transport = {
                targets: [
                    PRETTY_TRANSPORT,
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
                result.trace = child.trace.bind(child);
            case 'debug':
                result.debug = child.debug.bind(child);
            case 'info':
                result.info = child.info.bind(child);
            case 'warn':
                result.warn = child.warn.bind(child);
            case 'error':
                result.error = child.error.bind(child);
            case 'fatal':
                result.fatal = child.fatal.bind(child);
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
