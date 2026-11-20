/**
 * The framework's log, written through lukaot.
 *
 * `ILog` is the seam every component already holds, so this class is the whole of what the framework
 * needs from a logging library: a level-bound face per component, the declared vocabulary written
 * through that same face, and the call channel. lukaot supplies all three — `createLogger` for the
 * destination, `signalView` over the framework's registry for the declarations, `createCallChannel`
 * for the calls — which is why nothing here re-implements rendering, retention or masking.
 *
 * ## The two calling conventions, and where they meet
 *
 * blong's own code writes pino's way — `log.warn({fields}, 'message')` — because that is the shape
 * every call site in the tree uses, and a framework that renamed them all to `warn(message, fields)`
 * would have changed a thousand lines to buy nothing. lukaot's logger takes `(message, fields)`. The
 * translation is here, in one function, and it is also where the envelope is lifted: the framework's
 * `{$meta: {mtid, method}}` becomes lukaot's `messageId` and `operation`, which are the two fields its
 * renderer puts on the header line. Without that lift a converted record prints without the two
 * tokens a reader greps for (`@@F-764`).
 *
 * ## `fatal` is `error`
 *
 * lukaot's `fatal` retains synchronously and then *exits the process* — that is its contract, not a
 * defect of this adapter. The framework never writes at `fatal` (no call site in `core/blong-gogo`, a
 * realm or a suite does), but `ILogger` has the member, so it is mapped to `error` here rather than
 * left as a method that would terminate a running server the first time somebody used it.
 *
 * ## What is not wired yet
 *
 * `clusterUrl` is absent: the in-process service is lukaot's `startService`, and pointing the realm's
 * readers at it is the rest of `@@T-715`. Until then a deployment that configures a cluster reads one
 * elsewhere, which is what its own configuration says anyway.
 */

import {withProgress} from '@feasibleone/blong-lib';
import {
    Internal,
    type ICallLog,
    type ILog,
    type ILogger,
    type VocabularyProxy,
} from '@feasibleone/blong/types';
import {
    createCallChannel,
    createCaptureSurface,
    createLogger,
    getWriter,
    openCache,
    type CaptureSurface,
    type ICaptureSelector,
    type IMask,
    type LevelName,
    type LoggerOptions,
    type LogRecord,
    type Logger as LukaotLogger,
    type PayloadStore,
    type RecordCache,
    type RecordStore,
    type Writer,
} from '@feasibleone/lukaot/node';
import {
    createServiceWriter,
    startService,
    type RunningService,
    type ServiceWriter,
} from '@feasibleone/lukaot/service';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {callRecord, configureCallTrace, type CallTraceConfig} from './callTrace.ts';
import {frameworkSignalRegistry, default as frameworkVocabulary} from './frameworkSignals.ts';
import {signalBindings, signalView, type ISignalHost, type SignalWriter} from './signals.ts';

/** The levels this adapter writes at, in lukaot's spelling. */
const LEVELS: readonly LevelName[] = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'];

/**
 * A level name, declared here rather than imported.
 *
 * `core/blong` still types this as pino's `Level` — a type it will stop borrowing when the rest of
 * `@@T-715` lands — and a structural union is assignable to it either way, so the adapter does not
 * need the name to come from a package it is replacing.
 */
type Level = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export interface LukaotLogConfig {
    /** Which implementation is active. This class serves `lukaot`; the key is declared so the merged
     * `log` block can be handed to whichever implementation the loader chose. */
    impl?: string;
    /** The service every record carries. Defaults to `blong`, which is what the framework is. */
    service?: string;
    /** The service version, shown only when `details` asks for it. */
    version?: string;
    /** The threshold, and the level a component gets when its own config names none. */
    level?: Level | 'silent';
    /** `human` for a person reading a terminal, `json` for a tool. */
    format?: 'human' | 'json';
    color?: boolean;
    /** Print the `lukaot://` reference group on a human line. */
    refs?: boolean;
    /** Print the service, version and base fields on a human line. */
    details?: boolean;
    /** Dotted paths whose values are withheld before any sink. */
    redact?: string[];
    /** Retain records. A `{dir, limit}` block opens lukaot's cache; a store is used as it is. */
    cache?: {dir?: string; limit?: number} | RecordStore;
    /** Retain inline payloads, so a large field renders as its reference. */
    payloads?: PayloadStore;
    /** The messages whose caller is worth naming. Read by {@link callTrace} alone. */
    callSite?: string | string[];
    /** Whether a flow's calls are recorded, and where they are shown. */
    calls?: CallTraceConfig;
    /**
     * The cluster service: where records go to be assembled into signals, flows, diagrams and
     * search results, and where a realm's own pages read them back from.
     *
     * `enabled: false` means a process that only writes lines — a short-lived CLI, a `db` intent, a
     * released pod whose readers point at a service elsewhere. `url` is that elsewhere, and a
     * process given one writes to it instead of starting anything; `port: 0` asks the operating
     * system for a free one, which is what keeps two processes on one machine apart.
     */
    cluster?: {enabled?: boolean; port?: number; host?: string; url?: string};
    /**
     * How much of a payload each capture keeps, by declared identifier.
     *
     * The shape of the block is the operator's: `{level, enabled, sample, when: {method, phase}}`. A
     * capture named nowhere takes its declaration's rung, so a process that configures nothing still
     * has the cheap rungs available — `line`, which is a sentence rather than a payload — and raising
     * one to `body` is the deliberate act (`@@T-730`).
     */
    capture?: Record<string, CapturePolicy>;
    /**
     * Where a rendered line goes, when it is not the process's stdout.
     *
     * The loader never sets it — a process writes where the process writes — but a host embedding the
     * framework supplies its own destination, and a test does the same rather than replacing
     * `process.stdout.write` for the duration, which would swallow the test runner's own output.
     */
    writer?: Writer | null;
}

/**
 * The service this process started, if any.
 *
 * One per process, not one per log instance: the framework builds a log for the whole process and a
 * test may build several, and a service each would mean a socket each — which kept a test process
 * alive past its last assertion and, worse, gave every reader a different ledger of one process's
 * records. The promise is cached rather than the result, so a second instance arriving while the
 * first is still binding waits for the same socket instead of starting another.
 */
let started: Promise<RunningService | undefined> | undefined;

/**
 * What a scope says about one declared capture.
 *
 * `when` is the granularity the capture requirement asks for: a rung — or the whole capture — may be
 * raised for one operation of **one adapter instance** and nowhere else. Every field is a glob pattern
 * or a list of them, and a selection that matches no pattern takes no capture at all: the payload is
 * never built, which is the difference between configuration and a filter applied afterwards.
 *
 * `instance` is the port the capture was taken through, by the alias the framework assembles it with —
 * `<realm>.<layer>`, so `srv.db`, `srv.subject`, `login.loginDispatch`. That is the identity that makes
 * two instances of the same adapter different adapters to the operator, which is what "enable it for
 * the one I am debugging" means; `srv.*` therefore selects a realm's adapters and `*.http` the http
 * adapter wherever it runs (@@D-924).
 */
export interface CapturePolicy {
    level?: string;
    enabled?: boolean;
    sample?: number;
    mask?: IMask;
    when?: CaptureWhen;
}

/** Which operations of an instance, and which half of the exchange — the shape of a per-instance rule. */
export interface ICaptureRule {
    method?: string | string[];
    phase?: string | string[];
    /** The rung this instance renders at, over the policy's. */
    level?: string;
    /** What this instance withholds besides the policy's floor. */
    mask?: IMask;
}

/**
 * What `when` may say, in two spellings that answer the same question at different grains.
 *
 * The **flat** one scopes the capture process-wide: `when: {instance: [srv.http], method: ['chat.*']}`.
 * The **keyed** one gives each instance its own rule, which is what a deployment wants when one adapter
 * is being debugged and the rest must stay quiet:
 *
 * ```yaml
 * when:
 *     srv.http: true # everything this instance does
 *     srv.db: false # nothing, whatever the policy says
 *     'srv.*': {method: ['chat.*'], level: headers} # the rest of the realm, narrowed
 *     '*': {phase: [response]} # and everything else, one half only
 * ```
 *
 * The keys are instance ids and may be globs (`*` matches everything), and the most specific match
 * wins — a literal id beats a glob, and a longer glob beats a shorter one. When any instance key is
 * present the keys are the whole rule: an instance that matches none takes no capture, and `'*'` is how
 * a configuration says "the rest". The flat fields are the shorthand for the single-instance case and
 * are not consulted beside keys (@@D-925).
 */
export interface CaptureWhen extends ICaptureRule {
    instance?: string | string[];
    [instance: string]: unknown;
}

/**
 * The `when` block as the resolver reads it: the flat selection, plus the per-instance rules ordered
 * most specific first, so the first match is the answer.
 */
interface INormalisedWhen extends ICaptureRule {
    instance?: string | string[];
    rules?: Array<{pattern: string; rule: true | false | ICaptureRule}>;
}

/** Whether a glob pattern matches a method name, `*` within a segment and `**` across them. */
function globMatches(pattern: string, value: string): boolean {
    const source = pattern
        .split('')
        .map(char =>
            char === '*'
                ? '[^/]*'
                : char === '.'
                  ? '\\.'
                  : char === '/'
                    ? '/'
                    : char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
        )
        .join('')
        .replace(/\[\^\/\]\*\[\^\/\]\*/g, '.*');
    return new RegExp(`^${source}$`).test(value);
}

/** Whether a selector matches the patterns a policy named; no patterns means any. */
function selectorMatches(
    patterns: string | string[] | undefined,
    value: string | undefined,
): boolean {
    if (patterns === undefined) return true;
    if (value === undefined) return false;
    const list = typeof patterns === 'string' ? [patterns] : patterns;
    return list.some(pattern => globMatches(pattern, value));
}

/**
 * The rule that governs one instance: the first pattern in a most-specific-first list that matches it.
 *
 * `undefined` is not `false`: it means no key named this instance, which is a different answer from a
 * key that named it and switched it off — the first takes no capture because the list is the rule, the
 * second because somebody said so.
 */
function matchRule(
    rules: ReadonlyArray<{pattern: string; rule: true | false | ICaptureRule}>,
    instance: string | undefined,
): true | false | ICaptureRule | undefined {
    if (instance === undefined) return undefined;
    for (const {pattern, rule} of rules) if (globMatches(pattern, instance)) return rule;
    return undefined;
}

/** The keys a `when` block uses for the flat spelling; every other key is an instance rule. */
const WHEN_FLAT_KEYS = new Set(['instance', 'method', 'phase', 'level', 'mask']);

/** A pattern list as plain data, so a later merge cannot rewrite a policy already read. */
const copiedList = (patterns: string | string[] | undefined): string | string[] | undefined =>
    Array.isArray(patterns) ? [...patterns] : patterns;

/** The filters of one rule, copied; `undefined` when the value says nothing usable. */
function copyRule(value: unknown): true | false | ICaptureRule | undefined {
    if (typeof value === 'boolean') return value;
    if (value === null || typeof value !== 'object') return undefined;
    const rule = value as ICaptureRule;
    const copied: ICaptureRule = {
        ...(rule.method === undefined ? {} : {method: copiedList(rule.method)}),
        ...(rule.phase === undefined ? {} : {phase: copiedList(rule.phase)}),
        ...(rule.level === undefined ? {} : {level: rule.level}),
        ...(rule.mask === undefined ? {} : {mask: rule.mask}),
    };
    return Object.keys(copied).length > 0 ? copied : undefined;
}

/**
 * The `when` block split into the flat selection and the per-instance rules.
 *
 * The rules are ordered most specific first — a literal id before a glob, and a longer glob before a
 * shorter one — so the resolver's first match is the answer without comparing weights at call time.
 * Specificity is expressed as "the key that names the instance more precisely", which is what an
 * operator expects from `srv.http` beside `srv.*` beside `*` (@@D-925).
 */
function normaliseWhen(when: CaptureWhen | undefined): INormalisedWhen | undefined {
    if (when === null || when === undefined || typeof when !== 'object') return undefined;
    const normalised: INormalisedWhen = {
        ...(when.instance === undefined ? {} : {instance: copiedList(when.instance)}),
        ...(when.method === undefined ? {} : {method: copiedList(when.method)}),
        ...(when.phase === undefined ? {} : {phase: copiedList(when.phase)}),
        ...(when.level === undefined ? {} : {level: when.level}),
        ...(when.mask === undefined ? {} : {mask: when.mask}),
    };
    const rules: Array<{pattern: string; rule: true | false | ICaptureRule}> = [];
    for (const [key, value] of Object.entries(when)) {
        if (WHEN_FLAT_KEYS.has(key)) continue;
        const rule = copyRule(value);
        if (rule !== undefined) rules.push({pattern: key, rule});
    }
    if (rules.length > 0) {
        const glob = (pattern: string): boolean => pattern.includes('*');
        rules.sort((a, b) =>
            glob(a.pattern) === glob(b.pattern)
                ? b.pattern.length - a.pattern.length
                : glob(a.pattern)
                  ? 1
                  : -1,
        );
        normalised.rules = rules;
    }
    return normalised;
}

/**
 * The capture policies as plain data, read once while the log is built.
 *
 * Copied field by field rather than spread, because the configuration the loader hands over is the
 * runtime's live proxy: a spread would keep its sub-proxies (and their factory-phase guard) alive for
 * the life of the process. `when` is copied the same way, and a list inside it is copied to an array
 * so a later merge of the configuration cannot rewrite a policy that has already been read
 * (@@F-771).
 */
function snapshotCapturePolicies(
    capture: LukaotLogConfig['capture'],
): Record<string, CapturePolicy> {
    if (capture === undefined || capture === null) return {};
    const copied: Record<string, CapturePolicy> = {};
    for (const [id, policy] of Object.entries(capture)) {
        if (policy === null || typeof policy !== 'object') continue;
        const when = normaliseWhen(policy.when);
        copied[id] = {
            ...(policy.level === undefined ? {} : {level: policy.level}),
            ...(policy.enabled === undefined ? {} : {enabled: policy.enabled}),
            ...(policy.sample === undefined ? {} : {sample: policy.sample}),
            ...(policy.mask === undefined ? {} : {mask: policy.mask}),
            ...(when === undefined ? {} : {when: when as CaptureWhen}),
        };
    }
    return copied;
}

/** Where records are retained when the configuration names no directory. */
const DEFAULT_CACHE_DIR = '~/.blong/log-cache';

/** How many entries the store keeps when the configuration names no bound. */
const DEFAULT_CACHE_LIMIT = 5000;

/** `~` as the home directory, because a configuration writes it that way. */
const expandHome = (dir: string): string =>
    dir.startsWith('~') ? join(homedir(), dir.slice(1)) : dir;

/** A level name for a threshold, translating pino's one extra word. */
function levelOf(level: Level | 'silent' | undefined): LevelName {
    if (level === undefined) return 'info';
    // `silent` is not a name lukaot has: it means "no records at all", which is a threshold above
    // every level rather than a level.
    if (level === 'silent') return 'fatal';
    return level as LevelName;
}

/**
 * The framework's `{$meta}` as lukaot's two header fields.
 *
 * Kept beside the caller so both the `$meta` members and the rest of the bag survive: the record's
 * JSON still shows `$meta`, and the human header shows `mtid` and `method` where lukaot looks for
 * them.
 */
function liftMeta(fields: Record<string, unknown>): Record<string, unknown> {
    const meta = fields.$meta as {mtid?: string; method?: string} | undefined;
    if (meta === undefined) return fields;
    // `$meta` is *moved*, not copied: its two members are on the record as `messageId` and
    // `operation`, which is where both the header and a JSON reader find them, and leaving the
    // object in place printed it a second time as a detail block under the line — the envelope on
    // the header and again as `$meta: {...}` beneath it.
    const {$meta: _meta, ...rest} = fields;
    return {
        ...rest,
        ...(meta.mtid === undefined ? {} : {messageId: meta.mtid}),
        ...(meta.method === undefined ? {} : {operation: meta.method}),
    };
}

export default class LukaotLog extends Internal implements ILog {
    #config: LukaotLogConfig & {level: LevelName};
    #logger: LukaotLogger;
    #vocabulary: VocabularyProxy;
    /**
     * The capture policies, copied out of the configuration this log was built with.
     *
     * A copy rather than the configured node, for two reasons. The configuration a process hands the
     * log is the runtime's live proxy, and a capture may be taken while a handler factory is running —
     * the loader arms the factory-phase guard around every factory call — so reading a leaf of it at
     * that moment threw `Config hot-reload anti-pattern: 'enabled' is a primitive…` instead of
     * recording the payload (@@F-771). And a capture policy is a *setting of this log*, like `level`
     * and `format`, which are copied for the same reason: the answer must not depend on when the first
     * payload happens to arrive.
     */
    #capture: Record<string, CapturePolicy>;
    /**
     * The options the logger reads on every emit, kept so `init()` can attach the store to a logger
     * that already exists.
     *
     * lukaot consults `options.cache`, `options.payloads` and `options.writer` per record rather
     * than capturing them, which is what lets the cache be opened asynchronously — opening it
     * scans a directory — without delaying the construction the loader does synchronously.
     */
    #options: LoggerOptions;
    /** Where a record is retained, once `init()` has opened it. */
    #store?: RecordCache;
    /** The service this process started, and where a reader of it should look. */
    #service?: RunningService;
    #clusterUrl?: string;
    /** The sink that feeds the service, once one is running or one was configured. */
    #sink?: ServiceWriter;

    public constructor(config: LukaotLogConfig = {}) {
        super();
        this.#config = {...config, level: levelOf(config.level)};
        this.#capture = snapshotCapturePolicies(config.capture);
        configureCallTrace(this.#config.calls);
        this.#options = {
            service: this.#config.service ?? 'blong',
            ...(this.#config.version === undefined ? {} : {version: this.#config.version}),
            level: this.#config.level,
            ...(this.#config.format === undefined ? {} : {format: this.#config.format}),
            ...(this.#config.color === undefined ? {} : {color: this.#config.color}),
            ...(this.#config.refs === undefined ? {} : {refs: this.#config.refs}),
            ...(this.#config.details === undefined ? {} : {details: this.#config.details}),
            ...(this.#config.redact === undefined ? {} : {redact: this.#config.redact}),
            ...(this.#config.cache && isStore(this.#config.cache)
                ? {cache: this.#config.cache}
                : {}),
            ...(this.#config.payloads === undefined ? {} : {payloads: this.#config.payloads}),
            // One destination for every record, whether or not a service is running: the caller's
            // writer (or the process's stdout) now, and the service's sink as well once `init()`
            // has an address for it. Nothing else changes when the service comes up, which is why a
            // record written before it started is still on the terminal.
            ...(this.#config.writer === null
                ? {writer: null}
                : {
                      writer: {
                          write: (line: string, record?: LogRecord) => this.#write(line, record),
                      },
                  }),
            // A record written at `fatal` must not end the process here: the framework has no such
            // call site, and the one place that reaches this member (a remote level filter) is
            // about matching, not about exiting.
            exit: () => undefined,
        };
        this.#logger = createLogger(this.#options);
        this.#vocabulary = signalView(
            frameworkSignalRegistry(),
            this.#writerFor(this.#logger),
        ).vocabulary;
    }

    /**
     * Open the store and start the service — the two things that need the filesystem and a socket.
     *
     * The loader calls this before any realm loads and reads {@link clusterUrl} straight after, so a
     * realm's own port learns where to read its flows from before it configures itself. Every failure
     * is reported and swallowed: a process whose telemetry could not open a socket still has its
     * records on its own writer, and refusing to run over that would make the aid more important than
     * the work.
     */
    public async init(): Promise<void> {
        const {cache, cluster} = this.#config;
        if (cache && !isStore(cache)) {
            try {
                this.#store = await openCache({
                    dir: expandHome(cache.dir ?? DEFAULT_CACHE_DIR),
                    limit: cache.limit ?? DEFAULT_CACHE_LIMIT,
                });
                // Assigned onto the live options, which the logger reads per record — so every record
                // from here on is retained, and the ones written before it simply were not.
                this.#options.cache = this.#store;
                this.#options.payloads = this.#store;
            } catch (error) {
                this.#complain('lukaot: the record store could not be opened', error);
            }
        }
        if (cluster?.enabled === false) return;
        const configured = cluster?.url;
        if (configured) {
            // A deployment that points at a service elsewhere writes to it and starts nothing.
            this.#clusterUrl = configured;
            this.#sink = createServiceWriter({url: configured});
            return;
        }
        try {
            started ??= startService({
                port: cluster?.port ?? 0,
                host: cluster?.host,
            });
            const service = await started;
            if (!service) return;
            // The listener is an aid, not a reason to keep a process alive: a short-lived run and a
            // test both stop the port themselves, and a service still holding the event loop open
            // after the last assertion is the whole difference between a passing run and a timeout.
            (service.app.server as {unref?: () => void}).unref?.();
            this.#service = service;
            this.#clusterUrl = service.url;
            this.#sink = createServiceWriter({url: service.url});
        } catch (error) {
            this.#complain('lukaot: the cluster service could not be started', error);
        }
    }

    /**
     * The address of the service this process started for its own records.
     *
     * Published to the manifest by the loader, because the realm that reads the service answers on a
     * *port* and a port needs an address: the service binds a port the operating system chose, so
     * without this a reader would fall back to the conventional one and reach whichever other
     * process on the machine holds it.
     */
    public get clusterUrl(): string | undefined {
        return this.#clusterUrl;
    }

    /** What this process retains, for a reader that lives in it — the realm's own pages. */
    public get store(): RecordCache | undefined {
        return this.#store;
    }

    /**
     * Stop what this process started: the sink, the service, and the store.
     *
     * The store as well, because `stop()` is what a caller — a test, a short-lived run — uses to mean
     * "nothing of this platform is still running", and a cache still serialising a write is a
     * directory somebody then removes out from under it (`ENOTEMPTY`, from cacache's own cleanup, in
     * a test that only wanted to tidy its temporary store) (`@@T-718`).
     */
    public async stop(): Promise<void> {
        await this.#sink?.flush();
        await this.#service?.stop();
        this.#service = undefined;
        await this.#store?.close();
        this.#store = undefined;
    }

    /** One record to every destination: the caller's, then the service's. */
    #write(line: string, record?: LogRecord): void {
        const primary = this.#config.writer;
        if (primary === null) return;
        if (primary) primary.write(line, record);
        else getWriter()?.write(line, record);
        // The declared identifier reaches this point as a *field* — it is written that way because
        // the printer prints it there (`signal: frameworkWatchFileChanged`) — while the service counts
        // by the record's identity, which is the top-level member. Promoting it is what makes a
        // framework record arrive at all: the sink refuses a record that names no signal, so every
        // line this adapter wrote used to be dropped before it left the process (`@@T-718`).
        const identifier = (record?.fields as {signal?: unknown} | undefined)?.signal;
        if (record !== undefined && typeof identifier === 'string' && identifier.length > 0) {
            (record as {signal?: string}).signal = identifier;
        }
        this.#sink?.write(line, record as never);
    }

    #complain(message: string, error: unknown): void {
        const reason = error instanceof Error ? error.message : String(error);
        this.#logger.warn(message, {reason});
    }

    public override get signal(): VocabularyProxy | undefined {
        return this.#vocabulary;
    }

    /**
     * The vocabulary, written through a child bound to one component's name.
     *
     * The child carries the name as its `context`, which is the token lukaot's header prints where
     * pino printed the logger's `name` — so a converted call site keeps saying which component
     * reported it.
     */
    /**
     * The captures one adapter instance may take, resolved against the process's configuration.
     *
     * Built on demand and cached per instance, because the surface is a stable answer for a binding:
     * the configuration does not change between two calls of one adapter's method. `name` is the
     * instance's alias — `<realm>.<layer>`, the id the framework assembles the port with — and it is
     * handed to the resolver as well as to the child, so a policy can name the one instance it is
     * debugging while the other instances of the same adapter pay nothing (@@D-924).
     */
    public captureFor(name: string, level?: Level): CaptureSurface | undefined {
        const declared = frameworkVocabulary.declared.capture;
        if (declared === undefined || Object.keys(declared).length === 0) return undefined;
        const child = this.#child({context: name}, level);
        const capture = Object.fromEntries(
            Object.entries(declared).map(([id, entry]) => [
                id,
                {kind: 'capture' as const, id, ...entry},
            ]),
        );
        return createCaptureSurface({
            capture,
            resolve: (entry, selector) => this.#resolveCapture(entry, selector, name),
            write: record => {
                // A capture is a record like any other: the identity it was declared under, the rung it
                // was rendered at, and the values the shape kept — with the payload inline, because the
                // retention half of `@@T-730` owns moving it behind a reference.
                // lukaot's own order here — the sentence first — because this writes through the
                // logger directly rather than through the component face the call sites use.
                child.info(record.message, {
                    capture: record.id,
                    shape: record.shape,
                    rung: record.level,
                    ...(record.masked === 0 ? {} : {masked: record.masked}),
                    bytes: record.bytes,
                    ...(record.fields ?? {}),
                    ...(record.payload === undefined ? {} : {payload: record.payload}),
                });
            },
        });
    }

    /**
     * What the configuration says about one capture, at one selection, for one instance.
     *
     * `enabled` is resolved the way a log signal's is: the configuration has the last word, and the
     * declaration is the default it starts from. So a capture declared off — which is what the
     * framework's three do, since a payload is something an operator asks for — is turned on by an
     * `enabled: true` in the process's configuration, and one declared on is turned off by an
     * `enabled: false` (@@F-770). A capture the configuration names without saying either way is on,
     * because naming it is the ask.
     */
    #resolveCapture(
        entry: {id: string; enabled?: boolean},
        selector: ICaptureSelector,
        instance?: string,
    ): {level: string; mask?: IMask} | undefined {
        const policy = this.#capture[entry.id];
        const enabled = policy?.enabled ?? (policy === undefined ? (entry.enabled ?? true) : true);
        if (!enabled) return undefined;
        const when = policy?.when as INormalisedWhen | undefined;
        // The rule the instance's own key carries, when the keyed spelling is in use and the rule
        // narrows anything: `undefined` means "no rule object", either because the flat spelling is in
        // use or because the key said `true` and left the policy's own settings in place.
        let rule: ICaptureRule | undefined;
        if (when?.rules === undefined) {
            // The flat spelling: one selection for the whole process.
            if (!selectorMatches(when?.instance, instance)) return undefined;
            if (!selectorMatches(when?.method, selector.method)) return undefined;
            if (!selectorMatches(when?.phase, selector.phase)) return undefined;
        } else {
            // The keyed spelling: the keys are the rule, so an instance nobody named takes nothing.
            const matched = matchRule(when.rules, instance);
            if (matched === undefined || matched === false) return undefined;
            if (matched !== true) {
                if (!selectorMatches(matched.method, selector.method)) return undefined;
                if (!selectorMatches(matched.phase, selector.phase)) return undefined;
                rule = matched;
            }
        }
        const level = rule?.level ?? policy?.level;
        const mask = rule?.mask ?? policy?.mask;
        return {
            ...(level === undefined ? {} : {level}),
            ...(mask === undefined ? {} : {mask}),
        } as {level: string; mask?: IMask};
    }

    public signalFor(name: string, level?: Level): VocabularyProxy | undefined {
        const child = this.#child({context: name}, level);
        return signalView(frameworkSignalRegistry(), this.#writerFor(child)).vocabulary;
    }

    /**
     * A child in pino's shape, because that is the type `ILog` gives it.
     *
     * The two callers are `RpcServer` and `Gateway`, and both hand the result to fastify as
     * `loggerInstance` — so what they need is not a lukaot logger but an object pino's callers can
     * talk to: six members taking `(fields, message)` and a `child` of the same shape. That face is
     * built here rather than every call site adapting, which is also what lets `core/blong` stop
     * importing pino's types when the rest of `@@T-715` lands.
     */
    public child = ((
        bindings: Record<string, unknown>,
        options?: {level?: Level | 'silent'},
    ): Record<string, unknown> =>
        // The framework's callers pass pino's two arguments — bindings and options — and only the
        // level in the options is meaningful: lukaot's child takes bindings alone and is levelled
        // afterwards, which is why a component's own threshold still wins.
        this.#pinoFace(this.#child(bindings ?? {}, options?.level))) as unknown as ILog['child'];

    /** A lukaot logger wearing pino's calling convention, for a library that asks for one. */
    #pinoFace(logger: LukaotLogger): Record<string, unknown> {
        const face: Record<string, unknown> = {};
        for (const level of LEVELS) face[level] = this.#call(logger, level);
        // `fastify`'s logger type carries the word for silence and a level of its own; nothing in the
        // framework asks for either, and a writer that drops the line is the honest answer.
        face.silent = () => undefined;
        face.child = (bindings: Record<string, unknown>) => this.#pinoFace(this.#child(bindings));
        Object.defineProperty(face, 'level', {
            get: () => logger.level(),
            set: (level: Level | 'silent') => logger.setLevel(levelOf(level)),
        });
        return face;
    }

    public setLevel(level: Level | 'silent'): void {
        const name = levelOf(level);
        this.#config.level = name;
        this.#logger.setLevel(name);
    }

    public logger(
        level: Level | 'silent' = this.#config.level,
        bindings: object,
    ): ReturnType<ILog['logger']> {
        const child = this.#child(bindings as Record<string, unknown>, level);
        const result: ILogger = {};
        // Every member is present, and the *logger* decides what is written — which is what a level face
        // promised before this implementation existed. The alternative (a face that carries only the
        // members its threshold allows) looked tidier and broke a real case: `adapter.error()` demotes an
        // expected failure to `debug`, and on a face bound at `info` the member was simply absent, so the
        // demotion wrote nothing at all instead of being filtered by the threshold.
        for (const member of LEVELS) {
            // `fatal` is left out on purpose: lukaot's `fatal` retains and then exits the process, and no
            // framework call site writes at that level (see the mapping note at the head of this file).
            if (member === 'fatal') continue;
            (result as Record<string, unknown>)[member] = this.#call(child, member);
        }
        return {
            ...result,
            progress: (label, promise, options) => withProgress(result, label, promise, options),
            calls: this.#callsChannel(child),
        };
    }

    /** The call channel, as a component that holds the log rather than a logger reaches it. */
    public get calls(): ICallLog {
        return this.#callsChannel(this.#logger);
    }

    /** One level member, translating the framework's `(fields, message)` into lukaot's order. */
    #call(logger: LukaotLogger, level: LevelName): (...args: unknown[]) => void {
        return (...args: unknown[]) => {
            const [first, second] = args;
            const message = typeof first === 'string' ? first : String(second ?? '');
            const fields =
                typeof first === 'string'
                    ? ((second ?? {}) as Record<string, unknown>)
                    : ((first ?? {}) as Record<string, unknown>);
            logger[level](message, liftMeta(fields));
        };
    }

    #child(bindings: Record<string, unknown>, level?: Level | 'silent'): LukaotLogger {
        // `name` is the framework's word for the component; lukaot prints the same token as
        // `context`, and an explicit `context` in the config wins because a port sets both.
        const {name, context, ...rest} = bindings;
        const child = this.#logger.child({
            ...rest,
            ...(context !== undefined ? {context} : name !== undefined ? {context: name} : {}),
        });
        if (level !== undefined) child.setLevel(levelOf(level));
        return child;
    }

    #writerFor(logger: LukaotLogger): SignalWriter {
        return record => {
            const face = {
                [record.level]: (bindings: object, message: string) =>
                    logger[record.level](message, liftMeta(bindings as Record<string, unknown>)),
            } as ISignalHost['log'];
            face?.[record.level]?.(signalBindings(record), record.message);
        };
    }

    #callsChannel(logger: LukaotLogger): ICallLog {
        return createCallChannel(({leg, phase, message, error, fields}) => {
            logger[phase === 'error' ? 'warn' : 'debug'](message, {
                ...callRecord(leg, phase),
                ...(error === undefined ? {} : {err: error}),
                ...fields,
            });
        });
    }
}

/** Whether a `cache` value is a store rather than the block that opens one. */
function isStore(value: {dir?: string; limit?: number} | RecordStore): value is RecordStore {
    return typeof (value as RecordStore).put === 'function';
}
