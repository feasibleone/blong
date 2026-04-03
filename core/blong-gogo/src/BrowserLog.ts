import {Internal, type ILog} from '@feasibleone/blong/types';
import {pino, type Level, type Logger, type LoggerOptions} from 'pino';

// ── level constants (pino uses numeric levels matching bunyan) ──────────────
const TRACE = 10, DEBUG = 20, INFO = 30, WARN = 40, ERROR = 50, FATAL = 60;

const nameFromLevel: Record<number, string> = {
    [TRACE]: 'trace', [DEBUG]: 'debug', [INFO]: 'info',
    [WARN]: 'warn', [ERROR]: 'error', [FATAL]: 'fatal',
};

const LEVEL_CSS: Record<string, string> = {
    trace: 'color: grey',
    debug: 'color: blue',
    info:  'color: cyan',
    warn:  'color: magenta',
    error: 'color: red',
    fatal: 'color: red; font-weight: bold',
};
const DEFAULT_CSS = {
    def:     'color: black',
    msg:     'color: darkblue',
    service: 'color: darkorange',
    mtid:    'color: Magenta',
    src:     'color: DimGray; font-style: italic; font-size: 0.9em',
};

// Fields written separately; everything else goes into the `details` object
const SKIP = new Set([
    'name', 'hostname', 'pid', 'level', 'component', 'msg', 'time', 'v',
    'src', 'error', 'clientReq', 'clientRes', 'req', 'res',
    '$meta', 'mtid', 'jsException', 'service',
]);

export interface IBrowserLogConfig {
    level?: Level;
    /** Route each log call to the matching console.warn / console.error etc.
     *  instead of always using console.log. Default: false */
    logByLevel?: boolean;
}

function write(rec: Record<string, unknown>, logByLevel: boolean): void {
    const level = rec.level as number;
    const levelKey = nameFromLevel[level] ?? 'info';
    const paddedLevel = levelKey.toUpperCase().padStart(5);

    // Choose the console method
    let consoleMethod: (...a: unknown[]) => void = console.log; // eslint-disable-line no-console
    if (logByLevel) {
        const mapped = level <= TRACE ? 'debug' : level >= FATAL ? 'error' : levelKey;
        consoleMethod = (typeof (console as Record<string, unknown>)[mapped] === 'function'
            ? (console as Record<string, (...a: unknown[]) => void>)[mapped]
            : console.log); // eslint-disable-line no-console
    }

    const levelCss =
        level < DEBUG ? LEVEL_CSS.trace :
        level < INFO  ? LEVEL_CSS.debug :
        level < WARN  ? LEVEL_CSS.info  :
        level < ERROR ? LEVEL_CSS.warn  :
        level < FATAL ? LEVEL_CSS.error : LEVEL_CSS.fatal;

    // any fields not in the skip list become the expandable details object
    const details: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(rec)) {
        if (v != null && !SKIP.has(k)) details[k] = v;
    }
    const hasDetails = Object.keys(details).length > 0;

    const loggerName = rec.childName
        ? `${rec.name}/${rec.childName}`
        : (rec.name as string | undefined) ?? '';

    const time = rec.time instanceof Date
        ? rec.time.toISOString().slice(11, 23)
        : new Date().toISOString().slice(11, 23);

    const label =
        (rec.$meta as Record<string, string> | undefined)?.method ??
        (rec.$meta as Record<string, string> | undefined)?.opcode ??
        (rec.msg as string | undefined) ?? '';

    const fmt = `[%s] %c%s%c %s%c %s: %c%s %c%s${hasDetails ? ' %c%o' : ''}`;
    const args: unknown[] = [
        fmt,
        time,
        levelCss,    paddedLevel,
        DEFAULT_CSS.service,  rec.service ?? '',
        DEFAULT_CSS.def,      loggerName,
        DEFAULT_CSS.mtid,     (rec.mtid as string | undefined) ?? '',
        DEFAULT_CSS.msg,      label,
    ];
    if (hasDetails) args.push(DEFAULT_CSS.src, details);

    consoleMethod(...args);

    if (rec.error && (rec.error as {stack?: string}).stack)
        console.error(rec.error); // eslint-disable-line no-console
}

export default class BrowserLog extends Internal implements ILog {
    #logger: Logger;
    #config: IBrowserLogConfig = {level: 'info', logByLevel: false};

    public constructor(config: IBrowserLogConfig) {
        super();
        this.merge(this.#config, config);
        const logByLevel = this.#config.logByLevel ?? false;
        this.#logger = pino({
            level: this.#config.level ?? 'info',
            browser: {
                asObject: true,
                write: (rec: Record<string, unknown>) => write(rec, logByLevel),
            },
        });
    }

    public child<T extends string>(...params: Parameters<Logger<never>['child']>): Logger<T> {
        return this.#logger.child(...params) as Logger<T>;
    }

    public logger(
        level: LoggerOptions['level'] = this.#config.level,
        bindings: object,
    ): ReturnType<ILog['logger']> {
        const child = this.#logger.child(bindings, {level});
        const result = {trace: null, debug: null, info: null, warn: null, error: null, fatal: null};
        switch (level) {
            case 'trace':
                result.trace = child.trace.bind(child);
            case 'debug': // eslint-disable-line no-fallthrough
                result.debug = child.debug.bind(child);
            case 'info': // eslint-disable-line no-fallthrough
                result.info = child.info.bind(child);
            case 'warn': // eslint-disable-line no-fallthrough
                result.warn = child.warn.bind(child);
            case 'error': // eslint-disable-line no-fallthrough
                result.error = child.error.bind(child);
            case 'fatal': // eslint-disable-line no-fallthrough
                result.fatal = child.fatal.bind(child);
        }
        return result;
    }
}
