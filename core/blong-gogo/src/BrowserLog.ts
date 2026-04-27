import {Internal, type ILog, type ILogger} from '@feasibleone/blong/types';
import type {Level, Logger as PinoLogger} from 'pino';

// ── level constants (bunyan numeric levels) ──────────────────────────────────
const LEVEL_VALUES: Record<string, number> = {
    trace: 10,
    debug: 20,
    info: 30,
    warn: 40,
    error: 50,
    fatal: 60,
    silent: Infinity,
};

const NAME_FROM_VALUE: Record<number, string> = {
    10: 'trace',
    20: 'debug',
    30: 'info',
    40: 'warn',
    50: 'error',
    60: 'fatal',
};

const LEVEL_CSS: Record<string, string> = {
    trace: 'color: grey',
    debug: 'color: blue',
    info: 'color: cyan',
    warn: 'color: magenta',
    error: 'color: red',
    fatal: 'color: red; font-weight: bold',
};

const DEFAULT_CSS = {
    def: 'color: black',
    msg: 'color: cyan',
    service: 'color: darkorange',
    context: 'color: lightgreen',
    mtid: 'color: magenta',
    method: 'color: gold',
    src: 'color: DimGray; font-style: italic; font-size: 0.9em',
};

// Fields rendered separately; everything else becomes the expandable details object
const SKIP = new Set(['time', 'level', 'name', 'context', 'prefix', '$meta', 'msg']);

export interface IBrowserLogConfig {
    level?: Level;
    /** Route each log call to the matching console.warn / console.error etc.
     *  instead of always using console.log. Default: false */
    logByLevel?: boolean;
}

interface ISimpleLogger {
    level: string;
    child(bindings: Record<string, unknown>, options?: {level?: string}): ISimpleLogger;
    trace(obj: unknown, msg?: string): void;
    debug(obj: unknown, msg?: string): void;
    info(obj: unknown, msg?: string): void;
    warn(obj: unknown, msg?: string): void;
    error(obj: unknown, msg?: string): void;
    fatal(obj: unknown, msg?: string): void;
}

function write(
    rec: {
        time?: number;
        level?: number | string;
        name?: string;
        childName?: string;
        context?: string;
        prefix?: string;
        $meta?: {mtid?: string; method?: string};
        msg?: string;
        error?: unknown;
    },
    logByLevel: boolean,
): void {
    const levelNum = rec.level as number;
    const levelKey = NAME_FROM_VALUE[levelNum] ?? 'info';
    const paddedLevel = levelKey.toUpperCase().padStart(5);

    let consoleMethod: (...a: unknown[]) => void = console.log;
    if (logByLevel) {
        const mapped = levelNum <= 10 ? 'debug' : levelNum >= 60 ? 'error' : levelKey;
        const c = console as unknown as Record<string, (...a: unknown[]) => void>;
        consoleMethod = typeof c[mapped] === 'function' ? c[mapped] : console.log;
    }

    const levelCss = LEVEL_CSS[levelKey] ?? LEVEL_CSS.info;

    const details: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(rec)) {
        if (v != null && !SKIP.has(k)) details[k] = v;
    }
    const hasDetails = Object.keys(details).length > 0;

    const loggerName = rec.childName
        ? `${rec.name}/${rec.childName}`
        : ((rec.name as string | undefined) ?? '');

    const time = new Date((rec.time as number) ?? Date.now()).toISOString().slice(11, 23);

    const fmt = `[%s] %c%s %c(%s): %c%s%s%c%s%c%s%c%s${hasDetails ? ' %c%o' : ''}`;
    const pad = (s: unknown) => (s ? s + ' ' : '');
    const args: unknown[] = [
        fmt,
        time,
        levelCss,
        paddedLevel,
        DEFAULT_CSS.service,
        loggerName,
        DEFAULT_CSS.context,
        pad(rec.context),
        pad(rec.prefix),
        DEFAULT_CSS.mtid,
        pad(rec.$meta?.mtid),
        DEFAULT_CSS.method,
        pad(rec.$meta?.method),
        DEFAULT_CSS.msg,
        rec.msg,
    ];
    if (hasDetails) args.push(DEFAULT_CSS.src, details);

    consoleMethod(...args);

    if (rec.error && (rec.error as {stack?: string}).stack) console.error(rec.error);
}

function createLogger(
    level: string,
    bindings: Record<string, unknown>,
    logByLevel: boolean,
): ISimpleLogger {
    const levelNum = LEVEL_VALUES[level] ?? LEVEL_VALUES.info;

    function log(methodLevel: string, obj: unknown, msg?: string): void {
        const methodNum = LEVEL_VALUES[methodLevel] ?? LEVEL_VALUES.info;
        if (methodNum < levelNum) return;
        const rec: Record<string, unknown> = {
            ...bindings,
            level: methodNum,
            time: Date.now(),
            msg: typeof obj === 'string' ? obj : (msg ?? ''),
        };
        if (typeof obj === 'object' && obj !== null) Object.assign(rec, obj);
        write(rec, logByLevel);
    }

    return {
        level,
        child: (childBindings, options) =>
            createLogger(options?.level ?? level, {...bindings, ...childBindings}, logByLevel),
        trace: (obj, msg) => log('trace', obj, msg),
        debug: (obj, msg) => log('debug', obj, msg),
        info: (obj, msg) => log('info', obj, msg),
        warn: (obj, msg) => log('warn', obj, msg),
        error: (obj, msg) => log('error', obj, msg),
        fatal: (obj, msg) => log('fatal', obj, msg),
    };
}

export default class BrowserLog extends Internal implements ILog {
    #config: IBrowserLogConfig = {level: 'info', logByLevel: false};
    #logger: ISimpleLogger;

    public constructor(config: IBrowserLogConfig) {
        super();
        this.merge(this.#config, config);
        this.#logger = createLogger(
            this.#config.level ?? 'info',
            {},
            this.#config.logByLevel ?? false,
        );
    }

    public child<T extends string = never>(
        ...params: Parameters<PinoLogger['child']>
    ): PinoLogger<T> {
        const [bindings, options] = params;
        return this.#logger.child(
            bindings as Record<string, unknown>,
            options as {level?: string} | undefined,
        ) as unknown as PinoLogger<T>;
    }

    public logger(level: Level = this.#config.level ?? 'info', bindings: object): ILogger {
        const child = this.#logger.child(bindings as Record<string, unknown>, {level});
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
                result.trace = child.trace.bind(child) as ILogger['trace'];
            case 'debug':
                result.debug = child.debug.bind(child) as ILogger['debug'];
            case 'info':
                result.info = child.info.bind(child) as ILogger['info'];
            case 'warn':
                result.warn = child.warn.bind(child) as ILogger['warn'];
            case 'error':
                result.error = child.error.bind(child) as ILogger['error'];
            case 'fatal':
                result.fatal = child.fatal.bind(child) as ILogger['fatal'];
        }
        return result;
    }
}
