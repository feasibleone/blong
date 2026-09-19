/**
 * The logging front door (PRD R17, R18, R20).
 *
 * When no writer is configured the logger owns stdout, so zero-configuration
 * usage works; installing a writer (including `null`) always wins. Nothing
 * here can block on, or require, the cluster service (PRD R18).
 */

import {hostname} from 'node:os';
import {createRingBuffer} from './buffer.ts';
import type {PayloadStore, RecordStore} from './cache.ts';
import {currentContext, lastRecordId, rememberRecord, takeDecision} from './context.ts';
import {withIdentity} from './fingerprint.ts';
import type {LevelName} from './level.ts';
import {enabled, levelName, LEVELS, levelValue} from './level.ts';
import type {ErrorDetail, FlowState, LogRecord, RequestDetail, ResponseDetail} from './record.ts';
import {redactRecord, redactWithheldBag} from './redact.ts';
import {mintPayloadRef, mintRecordRef, PAYLOAD_THRESHOLD} from './refs.ts';
import {renderField, renderHuman, renderJson} from './render.ts';
import {packageVersion} from './version.ts';
import {createFanoutWriter, getWriter, type Writer} from './writer.ts';

export type Format = 'human' | 'json';

export interface LoggerOptions {
    /**
     * Service name — required; every record carries it (PRD R20), and the human
     * line prints it when `details` is asked for.
     */
    service: string;
    /**
     * Service version — carried in every record's base fields and rendered in
     * the human header when `details` is asked for (PRD R20; §5.1 "Base fields
     * (pid, hostname, service, version)"). Defaults to this package's own
     * version, which is what the emitter can know without configuration; a
     * service that wants its own version passes it here.
     */
    version?: string;
    /**
     * Print the service name, the version and the base fields (pid, hostname) in
     * the human line.
     *
     * Off by default. The deployment that reads these lines is a Kubernetes pod,
     * whose identity the reader already knows from where the line came, so the
     * three cost width on every line and buy little. They are all still on the
     * record — JSON mode, the retained store and the cluster service read them
     * there, and §5.1's "Base fields (pid, hostname, service, version)" is about
     * the record — so this decides the human line alone (R20).
     */
    details?: boolean;
    level?: LevelName | number;
    context?: string;
    /** Extra structured fields merged into every record. */
    bindings?: Record<string, unknown>;
    /**
     * Dotted paths whose values are replaced before the record reaches any sink
     * (§5.1 parity row "Redaction and path censorship"). Redaction runs at
     * record construction, so a withheld value is absent from the ring buffer
     * and the retained store as well as from every output mode.
     */
    redact?: string[];
    /** How many withheld detail entries to retain (PRD R10). Default 500. */
    withholdLimit?: number;
    /**
     * How many cache writes may be queued before the oldest is dropped (PRD
     * R21; bounds the memory a store that never answers can cost). Default
     * 1000. Drops are counted and reported as `writeDropped` on later records,
     * the way ring-buffer overflow is reported as `withheldDropped`. A value
     * below one (or `NaN`) is rejected at construction — see
     * `createWriteTracker` for why there is no sensible reading of it.
     */
    writeLimit?: number;
    format?: Format;
    color?: boolean;
    writer?: Writer | null;
    /**
     * Additional destinations, written in parallel with the primary writer
     * (§5.1 "Multiple sinks in parallel"; PRD R18). Appended *after* the primary
     * writer, so a sink never displaces stdout. A `null` primary writer —
     * including the process-wide silence sentinel — silences the sinks too:
     * `null` means "no output anywhere", not "no output on one destination".
     */
    sinks?: readonly Writer[];
    /**
     * Retain every emitted record locally so its reference still resolves after
     * this process has exited (PRD R21). Writes are asynchronous while `emit` is
     * synchronous; `flush` drains them. `fatal` is the exception, and writes
     * synchronously before it exits: `process.exit` drains nothing, so a queued
     * write would never run and the failure record would be the one record lost.
     *
     * Only the record half of the store is required here. The payload half is a
     * separate option (`payloads`) so a caller that only retains records — the
     * common case, and every test double for this seam — is not forced to
     * implement payload retention it never performs.
     */
    cache?: RecordStore;
    /**
     * Retain inline payloads (PRD R19/R20): the values of fields too large to
     * inline are written here, and the field renders as its
     * `semantic-log://payload/<id>` reference instead of the whole value.
     *
     * Omitted, no payload reference is minted and large values inline exactly
     * as before. A reference to a payload nothing retains is a dead link —
     * worse than the long line it replaces — so the two decisions (retain, and
     * render the reference) are taken together here rather than in the renderer
     * alone. `openCache` backs this and `cache` with the same bounded store, so
     * a caller normally passes the same object to both.
     */
    payloads?: PayloadStore;
    now?: () => number;
    /** Injected so tests never terminate the test process. */
    exit?: (code: number) => void;
}

export interface Logger {
    readonly service: string;
    trace(msg: string, fields?: Record<string, unknown>): void;
    debug(msg: string, fields?: Record<string, unknown>): void;
    info(msg: string, fields?: Record<string, unknown>): void;
    warn(msg: string, fields?: Record<string, unknown>): void;
    error(msg: string, fields?: Record<string, unknown>): void;
    fatal(msg: string, fields?: Record<string, unknown>): void;
    /** Hold detail back from the stream until escalation (PRD R10). */
    withhold(fields: Record<string, unknown>): void;
    /** Release withheld detail onto the next emitted record (PRD R10). */
    escalate(reason?: string): void;
    child(bindings: Record<string, unknown>): Logger;
    setLevel(level: LevelName | number): void;
    level(): LevelName | number;
    flush(): Promise<void>;
}

/**
 * Orders and drains a logger family's asynchronous cache writes (PRD R21).
 *
 * The seam between the synchronous logger and the asynchronous cache lives
 * here. `emit` cannot await, so it hands the write to a queue that outlives the
 * call; `flush` is the only way to know the records are on disk.
 *
 * A rejected write must never surface: Task 7 reports `unhandledRejection` at
 * `fatal`, and `fatal` exits the process, so an escaped rejection would end the
 * application the logger was supposed to be observing. The drain therefore
 * absorbs each failure — which also keeps a single bad write from poisoning
 * every later one, and keeps `flush` resolvable. The record is still lost; the
 * process is not.
 */
interface WriteTracker {
    /** Queue `write`, ordered after the writes already queued. */
    track(write: () => Promise<void>): void;
    /** Resolve once every queued write has settled. Never rejects. */
    flush(): Promise<void>;
    /** How many queued writes have been dropped, cumulatively. */
    dropped(): number;
}

/**
 * Bound the in-flight queue (PRD R21; §5.1 "Backpressure and drop policy").
 *
 * Same reasoning as `withholdLimit`: a store that never answers must cost a
 * bounded amount of memory, and the loss must be observable rather than silent.
 * The bound counts writes still *queued* — the one in flight is held by the
 * store, not by this queue — so a hung store retains at most this many unsent
 * records. Oldest-first matches the ring buffer's drop policy.
 *
 * The limit is a positive count. Zero cannot be honoured: every write has to be
 * held by the queue until it runs, so a limit of zero would either retain one
 * write anyway (and so mean one) or refuse to retain at all — and an earlier
 * implementation did neither, counting a drop for a write that had just been
 * queued. A value below one is a configuration error and is rejected where the
 * logger is built, rather than silently meaning something the caller did not
 * ask for. `NaN` is rejected by the same test, because every comparison against
 * it is false and the queue would grow without its bound.
 */
const DEFAULT_WRITE_LIMIT = 1000;

function createWriteTracker(limit: number): WriteTracker {
    if (!(limit >= 1)) {
        throw new RangeError(
            `writeLimit must be a positive number of writes, received ${String(limit)}`,
        );
    }
    const queue: Array<() => Promise<void>> = [];
    let dropped = 0;
    let running = false;
    let idle: Promise<void> = Promise.resolve();

    async function drain(): Promise<void> {
        while (queue.length > 0) {
            const write = queue.shift() as () => Promise<void>;
            try {
                await write();
            } catch {
                // Absorbed, exactly as the previous promise chain absorbed it: a
                // rejected write must never surface, must not poison a later
                // write, and must leave `flush` resolvable. The record is still
                // lost; the process is not.
            }
        }
        running = false;
    }

    return {
        track: write => {
            if (queue.length >= limit) {
                queue.shift();
                dropped++;
            }
            queue.push(write);
            if (!running) {
                running = true;
                // Started from a microtask, never on the caller's stack: `emit`
                // must not touch the store synchronously, which the offline
                // burst test pins. `drain` empties whatever is queued when it
                // runs, so a long burst costs one promise, not one per write.
                idle = Promise.resolve().then(drain);
            }
        },
        flush: () => idle,
        dropped: () => dropped,
    };
}

/**
 * Detach the retained record from the caller's own objects (PRD R21).
 *
 * `assembled.fields` is a shallow spread and `redactRecord` returns its input
 * unchanged when no `redact` paths are configured, so the constructed record
 * still aliases whatever the caller passed in. Retention is queued behind the
 * writes already in flight (see `WriteTracker`), so the serialisation can
 * happen arbitrarily later — after the caller has mutated an object it still
 * owns — and the retained artifact would then disagree with the text the writer
 * already rendered. R21 promises the CLI reads back the same record that was
 * rendered, so the value graph is copied *here*, at emit time, and the cache
 * sees a snapshot the caller can no longer reach.
 *
 * Redaction has already run, so the copy re-wraps the sanitised values rather
 * than resurrecting the withheld ones. `structuredClone` is the faithful copy;
 * a value it cannot clone (a function or symbol in `fields`) falls back to the
 * JSON round trip the cache would have performed anyway, and if even that fails
 * the original is retained: an exotic value must not turn a log call into a
 * throw.
 */
function snapshotRecord(record: LogRecord): LogRecord {
    try {
        return structuredClone(record);
    } catch {
        try {
            return JSON.parse(JSON.stringify(record)) as LogRecord;
        } catch {
            return record;
        }
    }
}

function toErrorDetail(value: unknown): ErrorDetail | undefined {
    if (value instanceof Error) {
        return {type: value.name, message: value.message, stack: value.stack};
    }
    if (value && typeof value === 'object') {
        return value as ErrorDetail;
    }
    return undefined;
}

/**
 * The record's flow state with the bound leg merged in (PRD R22).
 *
 * The leg is kept beside the flow in the ambient context because the flow object
 * is shared by reference with every nested scope — that is what makes a step's
 * position persist outward — so they are joined into one object only here, where a
 * record is assembled. On the wire, in the cache and in the registry, a record's
 * flow state is therefore still a single object.
 *
 * Total by construction: with no flow there is nothing to attribute a leg to (a leg
 * cannot be bound outside one), and with no leg the flow is returned unchanged, so
 * neither case can fabricate a flow-shaped object out of a leg. The declared
 * receiver and the position are attached only when they exist: an adopting callee
 * has no receiver of its own to report, and a record outside any call has neither.
 */
function flowWithLeg(
    flow: FlowState | undefined,
    leg: string | undefined,
    to: string | undefined,
    seq: string | undefined,
): FlowState | undefined {
    if (flow === undefined || leg === undefined) {
        return flow;
    }
    return {
        ...flow,
        leg,
        ...(to === undefined ? {} : {legTo: to}),
        ...(seq === undefined ? {} : {legSeq: seq}),
    };
}

function create(
    options: LoggerOptions,
    bindings: Record<string, unknown>,
    level: LevelName | number,
    writes: WriteTracker,
): Logger {
    const format: Format = options.format ?? 'human';
    // The base fields are collected only when they are going to be read: `pid`
    // and `hostname` name a container the pod already identifies, so they are the
    // least useful thing on its log line and are not carried at all unless the
    // `details` option asks for them. The other two of §5.1's "Base fields (pid,
    // hostname, service, version)" — the service and the version — are on every
    // record unconditionally; only the pod-level pair and the human line are
    // opt-in.
    const base = options.details ? {pid: process.pid, hostname: hostname()} : {};
    const version = options.version ?? packageVersion;
    const now = options.now ?? ((): number => Date.now());
    const sinks: readonly Writer[] = options.sinks ?? [];
    // Compose the destination pipeline once per writer, not once per record. The
    // sinks are fixed at construction; the primary writer is not always, because
    // `options.writer === undefined` means "the process-wide writer", which
    // `setWriter` can still swap — that seam is how a test silences output — and
    // `getWriter()` therefore has to be consulted per emit. The fan-out is built
    // on first use and keyed on the writer it was built from, so it is reused for
    // every later record and rebuilt only when the resolved writer actually
    // changes; a configured writer keeps one fan-out for the logger's whole life.
    let composedFor: Writer | null = null;
    let composed: Writer | null = null;
    const destination = (): Writer | null => {
        const primary = options.writer !== undefined ? options.writer : getWriter();
        if (!primary) {
            return null;
        }
        // A lone destination is written to directly, with no fan-out: there is
        // nothing to isolate it from, so the pre-fan-out failure semantics stay —
        // a broken stdout reaches the logger's caller instead of being swallowed
        // as one arm of a fan-out — and no fan-out is allocated. The fan-out buys
        // isolation *between* destinations, so it only earns its keep when there
        // is more than one.
        if (sinks.length === 0) {
            return primary;
        }
        if (composedFor !== primary) {
            composedFor = primary;
            composed = createFanoutWriter([primary, ...sinks]);
        }
        return composed;
    };
    const withheld = createRingBuffer<{time: number; fields: Record<string, unknown>}>(
        options.withholdLimit ?? 500,
    );

    const emit = (name: LevelName, msg: string, fields: Record<string, unknown> = {}): void => {
        if (!enabled(name, level)) {
            return;
        }
        // A failure is the signal that the withheld detail is now wanted (PRD
        // R10), so an `error`/`fatal` record escalates automatically and the
        // buffered entries ride it — removed from the buffer in the same step,
        // so they are escalated exactly once. A healthy record must not release
        // them: until escalation, withheld detail is invisible ("withheld means
        // withheld"). Filtered-out records return above, before the drain, so a
        // suppressed failure leaves the detail buffered rather than losing it.
        const escalates = name === 'error' || name === 'fatal';
        const pending = escalates && withheld.size() > 0 ? withheld.take() : [];
        // R20's header details are lifted out of the field bag: `messageId` and
        // `operation` belong in the greppable header the renderer already
        // supports, not in a detail line. A child binding may set them for the
        // whole child (a call site's own fields win), so a child logger can
        // correlate a family of records with one operation. Neither key is left
        // in `fields`, so no record renders one twice.
        const {err, req, res, messageId, operation, ...rest} = fields;
        const {messageId: boundMessageId, operation: boundOperation, ...boundRest} = bindings;
        const context = currentContext();
        // The causal parent (PRD R7): the id of the record most recently emitted
        // in this scope, read *before* this record's own id replaces it below, so
        // a record can never name itself as its parent. It is attached to `refs`
        // after redaction, like `refs.record` itself — a parent id is a locally
        // minted ULID, never caller text, so there is nothing in it to withhold.
        const parent = lastRecordId();
        // The rationale is taken *here* — after the level guard above, so a
        // filtered-out record cannot consume a decision it will never carry,
        // and before the record is assembled and redacted below, so `decision`
        // is part of the tree the caller's `redact` patterns walk. Attaching it
        // after `redactRecord` would leave `decision.*` unreachable and reopen
        // the same bypass that was closed for the withheld bag. Taking it also
        // consumes it, so it lands on exactly one record (PRD R11).
        const decision = takeDecision();
        // The bound leg (PRD R22) rides *inside* `flow`, so a record's flow state
        // is one object on the wire, in the cache and in the registry.
        const flow = flowWithLeg(context.flow, context.leg, context.legTo, context.legSeq);
        const assembled: LogRecord = {
            id: mintRecordRef(),
            time: now(),
            level: LEVELS[name],
            levelName: levelName(LEVELS[name]),
            msg,
            service: options.service,
            version,
            context: options.context,
            messageId: (messageId ?? boundMessageId) as string | undefined,
            operation: (operation ?? boundOperation) as string | undefined,
            refs: {
                record: '',
                trace: context.trace,
            },
            err: toErrorDetail(err),
            req: req as RequestDetail | undefined,
            res: res as ResponseDetail | undefined,
            flow,
            intent: context.intent,
            // Only when a rationale was actually taken. An always-present
            // `decision: undefined` entry is still visible to `redactRecord`
            // (`Object.entries` yields undefined-valued keys), so a pattern that
            // matches the slot (`decision`, `decision.*`, `**`) would replace it
            // with the placeholder *string* — and `serializeForIdentity` assumes
            // a present `decision` is a `Decision`, so identity minting would
            // throw. Absent stays absent, as it was before this task.
            ...(decision ? {decision} : {}),
            fields: {
                ...base,
                ...boundRest,
                // The caller's own fields come after the bindings, so a call site
                // can override its logger's bindings (unchanged), and the
                // escalation payload comes after both. A caller field named
                // `withheld` must not overwrite the detail R10 just released —
                // the withheld bag is what the record exists to carry.
                ...rest,
                ...(pending.length ? {withheld: pending} : {}),
                ...(withheld.dropped() ? {withheldDropped: withheld.dropped()} : {}),
                ...(writes.dropped() ? {writeDropped: writes.dropped()} : {}),
            },
        };
        // Redaction runs *before* identity is minted. `withIdentity` derives
        // `template`, `fingerprint` and `refs.template` from the message and
        // error message, so deriving them from the plaintext would keep a
        // withheld value alive in every derived artifact — and a hash of a
        // withheld value is itself a leak (offline dictionary attacks,
        // cross-record correlation). Deriving the whole identity family from
        // what is actually retained closes that by construction. Rendering,
        // JSON mode and the cache all see this copy, so the withheld value is
        // absent from the ring buffer and the retained store too (§5.1).
        const redacted = redactRecord(assembled, options.redact ?? []);
        const record: LogRecord = withIdentity(redacted);
        // As with `decision` above: an always-present `parent: undefined` key is
        // still an own property (`Object.entries` sees it), so an in-memory,
        // ring-buffer or retained record would carry a key the wire drops.
        // Absent stays absent.
        record.refs = {...record.refs, record: record.id, ...(parent ? {parent} : {})};
        // This record becomes the parent of the next one emitted in this scope
        // (PRD R7). Remembered after the parent was read, so a record can never
        // be its own parent, and after redaction/identity so the id remembered
        // is the one the rendered line carries.
        rememberRecord(record.id);
        // The inline-payload reference kind (PRD R19/R20): a field whose
        // rendered text is too large to inline is retained and indexed under
        // `refs.payloads`, and the *rendered line* substitutes the reference for
        // the value. The value itself stays in `fields` — JSON mode carries it
        // verbatim, and nothing has to be fetched back before the record can be
        // understood — which is what makes the kind an "inline payload" rather
        // than a claim check.
        //
        // Minting and retention happen together, here, and only when a payload
        // store is configured. A reference to a payload nothing holds is a dead
        // link, worse than the long line it replaces, so a build with no store
        // mints no reference and the renderer inlines the value unchanged. The
        // threshold is the renderer's own (`renderField` + `PAYLOAD_THRESHOLD`),
        // measured on the same text the renderer will measure, so the two halves
        // cannot disagree about which field became a reference.
        //
        // Redaction has already run, so the retained payload is the redacted
        // value: the withheld plaintext is absent from the payload store exactly
        // as it is absent from the record store.
        if (options.payloads) {
            const payloads = options.payloads;
            const index: Record<string, string> = {};
            // `emit` always constructs `fields` — at minimum the `pid`/`hostname`
            // base — so this sweep cannot see a nullish bag. Iterating a copy
            // treats an absent bag as empty without the `?? {}` fallback that no
            // record can reach, which would otherwise be a branch on a gate that
            // requires every branch taken.
            for (const [key, value] of Object.entries({...record.fields})) {
                if (renderField(value).length < PAYLOAD_THRESHOLD) {
                    continue;
                }
                const json = JSON.stringify(value);
                // `renderField` already serialised this value to reach the
                // threshold, so it has a JSON form; the guard covers a value that
                // serialises differently between the two reads, where skipping is
                // the safe answer.
                if (json === undefined) {
                    continue;
                }
                const id = mintPayloadRef();
                index[key] = id;
                // A `fatal` exits synchronously, so its payload lands before
                // `emit` returns for the same reason its record does: a queued
                // write would never run.
                if (name === 'fatal') {
                    payloads.putPayloadSync(id, record.time, json);
                } else {
                    writes.track(() => payloads.putPayload(id, record.time, json));
                }
            }
            if (Object.keys(index).length > 0) {
                record.refs = {...record.refs, payloads: index};
            }
        }
        // Retention (PRD R21) is unconditional, exactly as the record's own id
        // is: it happens whether or not a writer is installed and whether or
        // not the cluster service is reachable, because a reference has to
        // resolve after the process that minted it has gone. The copy retained
        // is the constructed record — redaction has already run (above), and
        // the identity family is stamped, so the CLI reads back the same
        // artifact the writer rendered and R21's CLI/API parity holds. It is
        // snapshotted *synchronously* here, because the write itself is queued
        // and would otherwise serialise the record at whatever later moment the
        // queue reached it (a caller mutating its own object in between would
        // then change what was retained — see `snapshotRecord`). A normal write
        // is asynchronous, ordered by the tracker, which absorbs its failure;
        // `fatal` writes synchronously instead (below), because it exits.
        if (options.cache) {
            const cache = options.cache;
            const retained = snapshotRecord(record);
            if (name === 'fatal') {
                // A fatal record goes to disk *before* `emit` returns, because
                // the `exit` that follows is synchronous and `process.exit`
                // drains no pending I/O: the queued write below would never run,
                // making the single most important record the one that could
                // never be looked up. `putSync` never throws — a throw here
                // would escape the `uncaughtException`/`unhandledRejection`
                // handler that called `fatal` and abort the process instead of
                // reporting it — and the exit stays immediate, as Task 7
                // requires: nothing here waits on the queue.
                cache.putSync(retained);
            } else {
                writes.track(() => cache.put(retained));
            }
        }
        // `undefined` means "no writer configured": fall back to the
        // process-wide writer, which already defaults to `stdoutWriter`, so
        // zero-configuration usage emits. `null` is the explicit silence
        // sentinel and must be honoured as-is — a `?? stdoutWriter` fallback
        // must not come back. This guard is also what keeps the sentinel
        // *total*: with no primary writer there is no fan-out at all, so `null`
        // silences the sinks too rather than silencing one destination.
        const writer = destination();
        if (writer) {
            // The line is rendered once and handed to every destination
            // unchanged, so the fan-out cannot make two sinks disagree. `sinks`
            // are *appended* to the primary writer, never substituted for it —
            // the primary writer is always present when output is on at all,
            // which is what "stdout is always present" means (§5.1). With more
            // than one destination the write goes through the fan-out, which
            // isolates a broken destination from the rest — including a broken
            // primary: its throw is swallowed, the sinks on either side of it
            // still receive the line, and the failure is reported by whoever can
            // (see `service/transport.ts`). That is a deliberate difference from
            // the lone-destination case above, where no isolation exists and the
            // failure is the caller's.
            const line = `${format === 'json' ? renderJson(record) : renderHuman(record, {color: options.color ?? false, details: options.details ?? false})}\n`;
            writer.write(line, record);
        }
    };

    return {
        service: options.service,
        trace: (msg, fields) => emit('trace', msg, fields),
        debug: (msg, fields) => emit('debug', msg, fields),
        info: (msg, fields) => emit('info', msg, fields),
        warn: (msg, fields) => emit('warn', msg, fields),
        error: (msg, fields) => emit('error', msg, fields),
        fatal: (msg, fields) => {
            emit('fatal', msg, fields);
            // `emit` retained this record through `putSync`, so it is already on
            // disk before the exit below runs; the exit itself stays synchronous
            // and immediate (Task 7's contract) — nothing waits on the queue.
            (options.exit ?? ((code: number) => process.exit(code)))(1);
        },
        // Redaction runs before retention: the bag is sanitised under both the
        // position it will occupy once escalated (`fields.withheld[].fields`)
        // and the record root its own keys stand for, so the buffer never holds
        // a value the same patterns would have withheld from a record.
        withhold: fields =>
            withheld.push({time: now(), fields: redactWithheldBag(fields, options.redact ?? [])}),
        escalate: reason => {
            // The escalation record is `info`, so a level threshold above it
            // would filter the release away. Keep the detail buffered in that
            // case instead of draining it into a record that is never written —
            // escalation may still arrive through an `error`/`fatal`.
            if (withheld.size() === 0 || !enabled('info', level)) {
                return;
            }
            const pending = withheld.take();
            emit('info', reason ? `escalation: ${reason}` : 'escalation', {withheld: pending});
        },
        // Children share the tracker, so a parent's `flush` drains a child's
        // cache writes too: the cache belongs to the family, not to one logger.
        child: childBindings => create(options, {...bindings, ...childBindings}, level, writes),
        setLevel: next => void (level = next),
        level: () => level,
        flush: () => writes.flush(),
    };
}

/** Create the logging front door. */
export function createLogger(options: LoggerOptions): Logger {
    const level = options.level ?? 'info';
    return create(
        options,
        options.bindings ?? {},
        levelValue(level),
        createWriteTracker(options.writeLimit ?? DEFAULT_WRITE_LIMIT),
    );
}

/**
 * Record process-level failures through `logger` (§5.1 parity row
 * "Process-failure hooks (uncaught exception, unhandled rejection)").
 *
 * Both hooks report at `fatal`. A process-level failure is fatal by definition:
 * registering either listener already suppresses Node's default
 * terminate-on-failure behaviour, so once the event fires the process keeps
 * running — and at that instant the failure has *not* been recovered, which is
 * precisely why the event fired. `fatal` records the failure, retains it
 * synchronously through `putSync`, and exits through the configured `exit`, so
 * the process either leaves cleanly or says why it could not. The exit is
 * immediate: `fatal` does **not** drain writes queued before it, because a
 * synchronous flush of an asynchronous write contract is a contradiction — a
 * pending promise cannot be completed synchronously. The fatal record itself is
 * on disk when `fatal` returns; earlier queued records are not guaranteed to
 * reach the store. Reporting the same event at a lower severity would leave the
 * process running in an unknown state with neither an exit nor a retained
 * failure record.
 *
 * Returns a function that unregisters the handlers.
 */
export function captureProcessFailures(logger: Logger): () => void {
    const onException = (error: Error): void => logger.fatal('uncaughtException', {err: error});
    const onRejection = (reason: unknown): void =>
        logger.fatal('unhandledRejection', {err: reason});
    process.on('uncaughtException', onException);
    process.on('unhandledRejection', onRejection);
    return () => {
        process.off('uncaughtException', onException);
        process.off('unhandledRejection', onRejection);
    };
}
