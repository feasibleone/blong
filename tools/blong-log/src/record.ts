/**
 * What a record is, read the way lukaot writes it.
 *
 * Every line the framework emits now carries the same handful of members, and the viewer used to read
 * the pino-era spelling of some of them (`name` for the service, `$meta.method` for the operation).
 * This module is the one place that knows the current spelling, so a component that needs "which
 * service said this" or "which declared signal is this" does not repeat a `??` chain (`@@D-926`).
 *
 * A record's shape, as the framework writes it:
 *
 * ```json
 * {"id":"…","time":1420070400000,"level":30,"levelName":"info","msg":"writing /tmp/x.ts",
 *  "service":"blong","version":"0.1.0","refs":{"record":"…","template":"…"},
 *  "fields":{"context":"ApiSchema","signal":"frameworkSchemaFileRewritten","params":{"file":"/tmp/x.ts"}},
 *  "template":"[LEVEL: INFO] …","fingerprint":"…","signal":"frameworkSchemaFileRewritten"}
 * ```
 *
 * A **capture** is the same envelope with `fields.capture`, `fields.shape` and `fields.rung` beside the
 * fields its shape rendered, and the rendered payload in `fields.payload`.
 */

import type {LogEntry} from './types.ts';

/** The bag lukaot nests a line's own values in. */
export type FieldBag = Record<string, unknown>;

/** The fields of one record, or an empty bag — never `undefined`, so callers can read through it. */
export function fieldsOf(record: LogEntry): FieldBag {
    const fields = (record as {fields?: unknown}).fields;
    return fields !== null && typeof fields === 'object' ? (fields as FieldBag) : {};
}

/** The service the record came from — `blong` unless a suite names its own. */
export function serviceOf(record: LogEntry): string | undefined {
    const service = (record as {service?: unknown}).service;
    if (typeof service === 'string' && service.length > 0) return service;
    // The pino-era spelling, kept because an entry written before the conversion is still a record.
    return typeof record.name === 'string' ? record.name : undefined;
}

/**
 * The component or port that reported it — a port's instance id (`srv.db`), a component's class name.
 *
 * This is what the viewer used to call the service name: with one process writing every line, the
 * service is the same on all of them, and the identity an operator filters by is the port.
 */
export function contextOf(record: LogEntry): string | undefined {
    const context = fieldsOf(record)['context'];
    if (typeof context === 'string' && context.length > 0) return context;
    return undefined;
}

/** The declared signal identifier — `frameworkPortFailure`, `frameworkTcpFrame`. */
export function signalOf(record: LogEntry): string | undefined {
    const signal = (record as {signal?: unknown}).signal ?? fieldsOf(record)['signal'];
    return typeof signal === 'string' && signal.length > 0 ? signal : undefined;
}

/** The values the signal was called with, as declared placeholders resolved them. */
export function paramsOf(record: LogEntry): FieldBag | undefined {
    const params = fieldsOf(record)['params'];
    return params !== null && typeof params === 'object' ? (params as FieldBag) : undefined;
}

/** The operation the record is about — `db.subject.find`, `watch.config.reload`. */
export function operationOf(record: LogEntry): string | undefined {
    const operation = fieldsOf(record)['operation'] ?? record.$meta?.method;
    return typeof operation === 'string' && operation.length > 0 ? operation : undefined;
}

/** The kind of event in the framework's envelope — `event`, `error`, `deprecation`. */
export function messageIdOf(record: LogEntry): string | undefined {
    const messageId = fieldsOf(record)['messageId'] ?? record.$meta?.mtid;
    return typeof messageId === 'string' && messageId.length > 0 ? messageId : undefined;
}

/**
 * The trace the record belongs to, or `undefined` when it belongs to none.
 *
 * A record carries it at `refs.trace` — the causal identity propagated from the ambient context — while
 * the viewer's own column and filter were written for the pino-era `traceId` at the top level. Reading
 * both here is what keeps a lukaot record's trace visible; a record without one was emitted outside a
 * traced context (a boot step, a timer, an emit before any request entered the trace), which is why the
 * column is empty on some rows and not on others rather than broken.
 */
export function traceOf(record: LogEntry): string | undefined {
    const refs = (record as {refs?: unknown}).refs;
    const fromRefs =
        refs !== null && typeof refs === 'object' ? (refs as {trace?: unknown}).trace : undefined;
    for (const candidate of [fromRefs, (record as {traceId?: unknown}).traceId]) {
        if (typeof candidate === 'string' && candidate.length > 0) return candidate;
    }
    return undefined;
}

/** The record that caused this one, or `undefined` for the root of a chain. */
export function parentOf(record: LogEntry): string | undefined {
    const refs = (record as {refs?: unknown}).refs;
    const parent =
        refs !== null && typeof refs === 'object' ? (refs as {parent?: unknown}).parent : undefined;
    return typeof parent === 'string' && parent.length > 0 ? parent : undefined;
}

/** The record reference this line was minted under — the id a `parent` link names. */
export function recordRefOf(record: LogEntry): string | undefined {
    const refs = (record as {refs?: unknown}).refs;
    const ref =
        refs !== null && typeof refs === 'object' ? (refs as {record?: unknown}).record : undefined;
    return typeof ref === 'string' && ref.length > 0 ? ref : undefined;
}

/** One decision, as the record carries it — the branch that was taken and what it chose between. */
export interface IDecisionView {
    /** What the branch was about, stable across runs. */
    discriminator: string;
    /** Every candidate considered, in evaluation order. */
    candidates: string[];
    /** The branch actually taken. */
    chosen?: string;
    /** The values the decision was made from; retained locally, so often absent on the wire. */
    values?: FieldBag;
}

/**
 * The decision a record reports, or `undefined` when it reports none.
 *
 * A decision is the one-shot rationale a handler attaches with `decide()`: the same shape a sequence
 * diagram draws an `alt` block from, and the reason a chosen branch is explainable after the fact. It is
 * not the same thing as `progress.regions` — a region says the record was *emitted inside* a branch, a
 * decision says *why the branch was chosen*.
 */
export function decisionOf(record: LogEntry): IDecisionView | undefined {
    const decision = (record as {decision?: unknown}).decision;
    if (decision === null || typeof decision !== 'object') return undefined;
    const {discriminator, candidates, chosen, values} = decision as {
        discriminator?: unknown;
        candidates?: unknown;
        chosen?: unknown;
        values?: unknown;
    };
    if (typeof discriminator !== 'string' || discriminator.length === 0) return undefined;
    return {
        discriminator,
        candidates: Array.isArray(candidates) ? candidates.map(String) : [],
        ...(typeof chosen === 'string' && chosen.length > 0 ? {chosen} : {}),
        ...(values !== null && typeof values === 'object' ? {values: values as FieldBag} : {}),
    };
}

/** Where a record sits in a flow: the run it belongs to, the step, and the call it is part of. */
export interface IFlowView {
    /** The run: a ULID the caller minted for one execution of the flow. */
    id: string;
    /** The recurring process the run is an execution of — `transfer.single`. */
    kind?: string;
    /** The call this record belongs to, shared by both ends of it. */
    leg?: string;
    /** The unit that declared the leg — the caller. */
    from?: string;
    /** The participant the caller expected to answer it. */
    to?: string;
    /** The leg's position in the execution: a path of counters, which is what orders the calls. */
    seq?: string;
    /** The step the record was emitted at. */
    step?: string;
    /** The step's index, when the caller numbered it. */
    index?: number;
    /** How the run stood at this record. */
    status?: string;
}

/**
 * The flow a record belongs to, or `undefined` when it belongs to none.
 *
 * A leg is present only on the records of a call that crossed a participant boundary, and the caller and
 * the callee both report the same `leg` — which is what makes one arrow out of two records, and why the
 * `seq` counter rather than a timestamp is what orders them (`core/lukaot/src/record.ts`).
 */
export function flowOf(record: LogEntry): IFlowView | undefined {
    const flow = (record as {flow?: unknown}).flow;
    if (flow === null || typeof flow !== 'object') return undefined;
    const bag = flow as Record<string, unknown>;
    if (typeof bag['id'] !== 'string' || bag['id'].length === 0) return undefined;
    const text = (key: string): string | undefined => {
        const value = bag[key];
        return typeof value === 'string' && value.length > 0 ? value : undefined;
    };
    return {
        id: bag['id'],
        ...(text('kind') === undefined ? {} : {kind: text('kind')}),
        ...(text('leg') === undefined ? {} : {leg: text('leg')}),
        ...(text('legFrom') === undefined ? {} : {from: text('legFrom')}),
        ...(text('legTo') === undefined ? {} : {to: text('legTo')}),
        ...(text('legSeq') === undefined ? {} : {seq: text('legSeq')}),
        ...(text('step') === undefined ? {} : {step: text('step')}),
        ...(typeof bag['index'] === 'number' ? {index: bag['index']} : {}),
        ...(text('status') === undefined ? {} : {status: text('status')}),
    };
}

/** Who asked for the work: the name of the intent, the actor, the tenant and its priority. */
export interface IIntentView {
    name: string;
    actor?: string;
    tenant?: string;
    priority?: number;
}

/** The intent a record was emitted under, or `undefined` when nothing declared one. */
export function intentOf(record: LogEntry): IIntentView | undefined {
    const intent = (record as {intent?: unknown}).intent;
    if (intent === null || typeof intent !== 'object') return undefined;
    const bag = intent as Record<string, unknown>;
    if (typeof bag['name'] !== 'string' || bag['name'].length === 0) return undefined;
    return {
        name: bag['name'],
        ...(typeof bag['actor'] === 'string' && bag['actor'] ? {actor: bag['actor']} : {}),
        ...(typeof bag['tenant'] === 'string' && bag['tenant'] ? {tenant: bag['tenant']} : {}),
        ...(typeof bag['priority'] === 'number' ? {priority: bag['priority']} : {}),
    };
}

/**
 * The HTTP exchange a record reports, in either spelling.
 *
 * A lukaot record writes `{operation, target, headers}` for the request and `{status, headers,
 * elapsedMs}` for the response; the panel was written for the pino era's `{method, url, body}` and
 * `{statusCode, responseTime, body}`. Reading both is what stops a request line from rendering empty.
 */
export interface IExchangeView {
    /** The request line — `POST /transfers` — from either spelling. */
    request?: string;
    status?: number;
    elapsedMs?: number;
    requestHeaders?: Record<string, string>;
    responseHeaders?: Record<string, string>;
    requestBody?: unknown;
    responseBody?: unknown;
}

const headerBag = (value: unknown): Record<string, string> | undefined =>
    value !== null && typeof value === 'object' ? (value as Record<string, string>) : undefined;

/** The request/response detail a record carries, or `undefined` when it carries neither. */
export function exchangeOf(record: LogEntry): IExchangeView | undefined {
    const req = (record as {req?: unknown}).req;
    const res = (record as {res?: unknown}).res;
    if ((req === null || typeof req !== 'object') && (res === null || typeof res !== 'object'))
        return undefined;
    const q = (req ?? {}) as Record<string, unknown>;
    const s = (res ?? {}) as Record<string, unknown>;
    const request = [
        typeof q['operation'] === 'string' ? q['operation'] : undefined,
        typeof q['method'] === 'string' ? q['method'] : undefined,
        typeof q['target'] === 'string' ? q['target'] : undefined,
        typeof q['url'] === 'string' ? q['url'] : undefined,
    ].filter((part): part is string => part !== undefined && part.length > 0);
    const status =
        typeof s['status'] === 'number'
            ? s['status']
            : typeof s['statusCode'] === 'number'
              ? s['statusCode']
              : undefined;
    const elapsedMs =
        typeof s['elapsedMs'] === 'number'
            ? s['elapsedMs']
            : typeof s['responseTime'] === 'number'
              ? s['responseTime']
              : undefined;
    return {
        ...(request.length === 0 ? {} : {request: request.join(' ')}),
        ...(status === undefined ? {} : {status}),
        ...(elapsedMs === undefined ? {} : {elapsedMs}),
        ...(headerBag(q['headers']) === undefined ? {} : {requestHeaders: headerBag(q['headers'])}),
        ...(headerBag(s['headers']) === undefined
            ? {}
            : {responseHeaders: headerBag(s['headers'])}),
        ...(q['body'] === undefined ? {} : {requestBody: q['body']}),
        ...(s['body'] === undefined ? {} : {responseBody: s['body']}),
    };
}

/** One capture, as the record carries it. */
export interface ICaptureView {
    /** The declared identifier the capture was taken under — `frameworkTcpFrame`. */
    signal: string;
    /** The shape that rendered it — `tcp.frame`, `http.exchange`, `json`. */
    shape: string;
    /** How much of the payload the configuration kept — `line`, `hex`, `full`, `keys`, `body`, … */
    rung?: string;
    /** The rendered size, when the shape measured one. */
    bytes?: number;
    /** The fields the shape rendered beside the payload — `direction`, `phase`, `url`, `keys`, … */
    fields: FieldBag;
    /** The payload: hex for a frame, text for a document or an exchange body. */
    payload?: string;
}

/**
 * The capture a record carries, or `undefined` when it is an ordinary line.
 *
 * A capture is recognised by its declaration's `capture` field rather than by a level or a message: the
 * rule is the vocabulary's, and a line that happens to be worded like a capture is still a line.
 */
export function captureOf(record: LogEntry): ICaptureView | undefined {
    const bag = fieldsOf(record);
    const capture = bag['capture'];
    const shape = bag['shape'];
    if (typeof capture !== 'string' || typeof shape !== 'string') return undefined;
    const payload = bag['payload'];
    return {
        signal: capture,
        shape,
        ...(typeof bag['rung'] === 'string' ? {rung: bag['rung']} : {}),
        ...(typeof bag['bytes'] === 'number' ? {bytes: bag['bytes']} : {}),
        fields: bag,
        ...(typeof payload === 'string' ? {payload} : {}),
    };
}

/** One line of a hex dump: the offset, the sixteen bytes, and what they read as. */
export interface IHexRow {
    /** `0x0000`, `0x0010`, … */
    offset: string;
    /** Sixteen two-digit groups, or fewer on the last row. */
    hex: string[];
    /** The printable characters, with `.` where a byte is not one. */
    ascii: string;
}

/**
 * The bytes of a hex payload, or `undefined` when the payload is not hex.
 *
 * The framework writes a frame as `ff d8 ff db …`; a space-less string is accepted too, because a
 * payload that reached a reader by some other path should still render rather than be hidden.
 */
export function bytesOfHex(payload: string): number[] | undefined {
    const compact = payload.replace(/\s+/g, '');
    if (compact.length === 0 || compact.length % 2 !== 0) return undefined;
    if (!/^[0-9a-fA-F]+$/.test(compact)) return undefined;
    const bytes: number[] = [];
    for (let index = 0; index < compact.length; index += 2)
        bytes.push(parseInt(compact.slice(index, index + 2), 16));
    return bytes;
}

/**
 * A frame as the rows a hex editor draws: offset, bytes, and their ASCII beside them.
 *
 * Sixteen per row because that is what every dump tool a developer has used does, and the ASCII column
 * is what makes a text protocol readable at a glance — a `POST /iso8583` opening is visible there in a
 * way that `50 4f 53 54` is not (`@@D-927`).
 */
export function hexDump(payload: string, perRow = 16): IHexRow[] {
    const bytes = bytesOfHex(payload);
    if (bytes === undefined) return [];
    const rows: IHexRow[] = [];
    for (let start = 0; start < bytes.length; start += perRow) {
        const slice = bytes.slice(start, start + perRow);
        rows.push({
            offset: `0x${start.toString(16).padStart(4, '0')}`,
            hex: slice.map(byte => byte.toString(16).padStart(2, '0')),
            ascii: slice
                .map(byte => (byte >= 0x20 && byte <= 0x7e ? String.fromCharCode(byte) : '.'))
                .join(''),
        });
    }
    return rows;
}
