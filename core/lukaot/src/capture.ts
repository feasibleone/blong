/**
 * Captures: a payload recorded as a shape, rendered to a rung, masked before any sink.
 *
 * A capture is what a level call that dumped an object should have been (`@@D-904` `@@D-906`). The
 * framework has a dozen of them — an HTTP exchange, a wire frame, a data packet, a JSON document — and
 * what they have in common is that the *reader* wants the structure while the *operator* wants to
 * control how much of it is kept. So a capture is three separate decisions:
 *
 * - **The shape** says what the values are (a request has a method, a URL, headers, a body) and how to
 *   render them at each rung of a ladder — `line` for the one-line answer, `headers` when the names
 *   matter, `body` when the content does, `full` up to the retention bound.
 * - **The rung** is configuration, not code: an operator raises one adapter to `body` while the rest of
 *   the process stays at `line`.
 * - **The mask** withholds what must never reach a sink. It runs *here*, before the record is built,
 *   which is the property that matters: a renderer-side mask would leave the secret in the ring buffer,
 *   in the store and in the cluster service, and only hidden from the line. `@@D-906` states that a
 *   shape ships a floor of rules and a scope may add to it but never remove it.
 *
 * ## Why the mask language is not the redactor's
 *
 * `redact.ts` walks a *record* by dotted path and replaces what it finds with `[redacted]`. That covers
 * a JSON body exactly and an HTTP header only if the caller spells `headers.authorization` — and the
 * interesting cases in a payload are the ones a path cannot name: a header whose *name* matches
 * `/token|secret|key|password/i`, a field at any depth, a PAN at a fixed offset inside a binary frame.
 * So this module keeps the dotted-path idea and adds the three things a payload needs:
 *
 * - `deep` rules that match a key *name* at any depth, so `password` is withheld wherever it appears.
 * - `ignoreCase` per rule, because HTTP header names are case-insensitive and `Authorization` versus
 *   `authorization` is precisely the difference that leaks.
 * - `bytes` rules that withhold a range of a binary frame, because ISO 8583's field 52 sits at an
 *   offset and has no path at all.
 *
 * ## Three ways to withhold
 *
 * `hide` is `[redacted]` and reveals neither the value nor its length. `partial` keeps the ends
 * (`4242 **** 1234`) because an operator correlating two records needs to see that it is the same
 * card without reading it. `hash` keeps a short stable digest, which survives correlation across
 * records for a value the reader must not see at all.
 *
 * ## Nothing here writes
 *
 * A shape answers a rendered value; the emitter, the record and the sink are the caller's. That keeps
 * the ladder and the masking testable without a logger, which is why this module is in the emitter half
 * of lukaot rather than in the service.
 */

/** How a matched value is withheld. */
export type MaskMode = 'hide' | 'partial' | 'hash';

/** What a `partial` mask keeps of each end of the value. */
export interface IMaskKeep {
    /** Characters kept from the start. Defaults to 4. */
    head?: number;
    /** Characters kept from the end. Defaults to 4. */
    tail?: number;
}

/** One dotted-path rule over a shape's value. */
export interface IMaskPathRule {
    /** `headers.authorization`, `*.*.token`, `body.**`. `*` is one segment, `**` the rest. */
    at: string;
    how?: MaskMode;
    keep?: IMaskKeep;
    /**
     * Match path segments case-insensitively.
     *
     * Set on a subtree whose keys are not case-sensitive — HTTP headers are the case that brought it in:
     * `Authorization` and `authorization` are the same header, and a rule that matched only the
     * spelling the caller happened to use would leak the other one.
     */
    ignoreCase?: boolean;
}

/** A rule that matches a key *name* wherever it appears in the tree. */
export interface IMaskDeepRule {
    /** A name, or a pattern when the family is not enumerable — `token`, or `/secret|password/i`. */
    match: string | RegExp;
    how?: MaskMode;
    keep?: IMaskKeep;
}

/** A rule that withholds a range of a binary frame. */
export interface IMaskByteRule {
    /** Byte offset from the start of the frame. */
    offset: number;
    /** How many bytes to withhold. */
    length: number;
    how?: MaskMode;
}

/** What may be withheld from a payload, and how. */
export interface IMask {
    paths?: readonly IMaskPathRule[];
    deep?: readonly IMaskDeepRule[];
    bytes?: readonly IMaskByteRule[];
}

/** What a shape answers, and what the caller turns into a record. */
export interface IRendered {
    /** The one sentence a person reads — what the record's message becomes. */
    summary: string;
    /** The small values worth keeping structured — what the record's params become. */
    fields?: Record<string, unknown>;
    /**
     * The bulky part, when the rung asked for it. The caller decides where it goes: inline under the
     * payload threshold, and as a retained `lukaot://p/<id>` reference beyond it.
     */
    payload?: string;
    /** How many bytes the payload was before anything was withheld, so a reader knows the size. */
    bytes: number;
    /** How many values the mask withheld, so a reader knows something is missing rather than absent. */
    masked: number;
}

/** A payload family, with its ladder and its floor of mask rules. */
export interface ICaptureShape<T = unknown> {
    /** The declared shape name — `http.exchange`, `tcp.frame`, `json`. */
    name: string;
    /** The rungs this shape understands, cheapest first. */
    levels: readonly string[];
    /** Rules that apply to every capture of this shape, whatever the scope configured. */
    mask?: IMask;
    /** Render `value` at `level`, withholding what `mask` names. */
    render(value: T, level: string, mask: IMask, format: CaptureFormat): IRendered;
}

/** How a rendering is written: a line for a person, or JSON for a tool. */
export type CaptureFormat = 'text' | 'json';

/** What an HTTP exchange capture carries, in either half. */
export interface IHttpExchange {
    /** Which half of the exchange this is. */
    phase: 'request' | 'response';
    method?: string;
    url?: string;
    statusCode?: number;
    statusMessage?: string;
    headers?: Record<string, unknown>;
    body?: unknown;
    /** How long the exchange took, when the caller knows. */
    durationMs?: number;
}

/** What a wire frame carries. */
export interface ITcpFrame {
    /** Which way the bytes travelled. */
    direction: 'in' | 'out';
    data: Uint8Array;
}

/** What a JSON document capture carries. */
export interface IJsonPayload {
    value: unknown;
    /** What the document is, when the caller can say — `k8s.event`, `mle.body`. */
    label?: string;
}

/** The placeholder a `hide` mask writes. */
export const HIDDEN = '[redacted]';

/** How much of a body a rung keeps before it stops and says so. */
const BODY_LIMIT: Record<string, number> = {body: 2048, full: 8192};

/** How many bytes of a frame the cheapest rung shows. */
const FRAME_PREVIEW = 32;

/**
 * A short stable digest for a `hash` mask.
 *
 * FNV-1a, base36, six characters: enough to tell two values apart in one reader's session and not
 * enough to be worth attacking offline. It is *not* a secret — a hash of a low-entropy value is a
 * disclosure in itself — which is why `hide` remains the default and `hash` is chosen deliberately.
 */
function digest(value: string): string {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
        hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
    }
    return `#${(hash >>> 0).toString(36).slice(0, 6)}`;
}

/** The text a `partial` mask shows: the ends kept, the middle starred. */
function partial(value: string, keep: IMaskKeep | undefined): string {
    const head = Math.max(0, keep?.head ?? 4);
    const tail = Math.max(0, keep?.tail ?? 4);
    if (value.length <= head + tail) return HIDDEN;
    return `${value.slice(0, head)}${'*'.repeat(Math.min(8, value.length - head - tail))}${value.slice(-tail)}`;
}

/** Withhold one value, in the mode the rule asked for. */
export function withhold(value: unknown, how: MaskMode = 'hide', keep?: IMaskKeep): unknown {
    const text = typeof value === 'string' ? value : JSON.stringify(value);
    if (text === undefined) return HIDDEN;
    if (how === 'partial') return partial(text, keep);
    if (how === 'hash') return digest(text);
    return HIDDEN;
}

/** A path as segments, with `**` kept as the last element it is. */
const segmentsOf = (at: string): string[] => at.split('.').filter(part => part.length > 0);

/** Whether one path segment matches one pattern segment. */
const segmentMatches = (pattern: string, segment: string, ignoreCase: boolean): boolean => {
    if (pattern === '*') return true;
    if (pattern === '**') return true;
    return ignoreCase ? pattern.toLowerCase() === segment.toLowerCase() : pattern === segment;
};

/** Whether a key name matches a `deep` rule. */
const nameMatches = (match: string | RegExp, name: string): boolean =>
    typeof match === 'string' ? match === name : match.test(name);

/**
 * Withhold every value a mask names.
 *
 * Total and non-throwing: a payload is arbitrary data, and a mask that could crash the call site it
 * protects would be worse than the leak it prevents. A path that matches nothing withholds nothing —
 * the same silent miss `redact.ts` documents, and for the same reason: a typo must not take a process
 * down, but a reader must not be told the rule ran when it did not.
 *
 * The result is a deep copy down the paths that changed; anything untouched is shared with the input,
 * because a capture may be a large object and copying all of it to withhold one field is a cost paid by
 * every record.
 */
export function applyMask<T>(value: T, mask: IMask | undefined): {value: T; masked: number} {
    if (!mask || value === null || typeof value !== 'object') return {value, masked: 0};
    let masked = 0;
    const seen = new WeakMap<object, unknown>();

    const walk = (node: unknown, at: string[], ignoreCase: boolean): unknown => {
        if (node === null || typeof node !== 'object') return node;
        if (seen.has(node as object)) return seen.get(node as object);
        const own = node as Record<string, unknown>;
        const out: Record<string, unknown> | unknown[] = Array.isArray(node) ? [] : {};

        for (const [key, child] of Object.entries(own)) {
            const path = [...at, key];
            const deep = mask.deep?.find(rule => nameMatches(rule.match, key));
            // The *last* matching path rule wins, so a scope's own rule overrides the shape's floor for
            // the same path — the floor cannot be removed, but it can be made stricter.
            const hit = lastMatching(mask.paths, path, ignoreCase);
            if (deep || hit) {
                const rule = (hit ?? deep) as IMaskPathRule | IMaskDeepRule;
                (out as Record<string, unknown>)[key] = withhold(child, rule.how, rule.keep);
                masked += 1;
                continue;
            }
            (out as Record<string, unknown>)[key] = walk(child, path, ignoreCase);
        }
        seen.set(node as object, out);
        return out;
    };

    return {value: walk(value, [], false) as T, masked};
}

/** The last path rule that matches `at`, so a later rule can tighten an earlier one. */
function lastMatching(
    rules: readonly IMaskPathRule[] | undefined,
    at: string[],
    ignoreCase: boolean,
): IMaskPathRule | undefined {
    if (!rules) return undefined;
    for (let index = rules.length - 1; index >= 0; index -= 1) {
        const rule = rules[index] as IMaskPathRule;
        if (pathMatches(segmentsOf(rule.at), at, ignoreCase || Boolean(rule.ignoreCase)))
            return rule;
    }
    return undefined;
}

/** Whether a rule's path matches the path a value sits at. */
function pathMatches(pattern: string[], at: string[], ignoreCase: boolean): boolean {
    // A trailing `**` matches the remainder, so `body.**` withholds the whole subtree below `body`.
    for (let index = 0; index < pattern.length; index += 1) {
        const part = pattern[index] as string;
        if (part === '**') return at.length >= index;
        if (index >= at.length) return false;
        if (!segmentMatches(part, at[index] as string, ignoreCase)) return false;
    }
    return pattern.length === at.length;
}

/** Text of a body for a rung, truncated and saying so. */
function bodyText(body: unknown, level: string): {text: string; bytes: number} {
    const text =
        typeof body === 'string'
            ? body
            : body instanceof Uint8Array
              ? `<${body.length} bytes>`
              : (JSON.stringify(body) ?? '');
    const bytes = text.length;
    const limit = BODY_LIMIT[level];
    if (limit === undefined || text.length <= limit) return {text, bytes};
    return {text: `${text.slice(0, limit)}… (${text.length} chars)`, bytes};
}

/** The header names a rung shows, with their values withheld by the mask. */
function headerText(headers: Record<string, unknown> | undefined): string {
    if (!headers) return '';
    return Object.keys(headers).join(', ');
}

/**
 * The HTTP exchange: `line` → `headers` → `body` → `full`.
 *
 * The two halves are one shape with a `phase`, because the adapters capture them at different moments
 * and a pair correlates by the flow's leg and trace rather than by being glued into one record — the
 * request is worth a line before the response exists.
 */
export const httpExchange: ICaptureShape<IHttpExchange> = {
    name: 'http.exchange',
    levels: ['line', 'headers', 'body', 'full'],
    mask: {
        deep: [{match: /token|secret|key|password|authorization|cookie/i}],
        paths: [
            {at: 'headers.authorization', ignoreCase: true},
            {at: 'headers.cookie', ignoreCase: true},
            {at: 'headers.set-cookie', ignoreCase: true},
            {at: 'headers.proxy-authorization', ignoreCase: true},
            {at: 'headers.x-api-key', ignoreCase: true},
        ],
    },
    render(exchange, level, mask) {
        const {value, masked} = applyMask(exchange, mergeMask(httpExchange.mask, mask));
        const request = value.phase === 'request';
        const head = request
            ? `${value.method ?? 'GET'} ${value.url ?? ''}`
            : `${value.statusCode ?? 0} ${value.statusMessage ?? ''} ${value.method ?? ''} ${value.url ?? ''}`.trim();
        const summary = value.durationMs === undefined ? head : `${head} (${value.durationMs}ms)`;
        const fields: Record<string, unknown> = {
            phase: value.phase,
            ...(value.method === undefined ? {} : {method: value.method}),
            ...(value.url === undefined ? {} : {url: value.url}),
            ...(value.statusCode === undefined ? {} : {statusCode: value.statusCode}),
            ...(value.durationMs === undefined ? {} : {durationMs: value.durationMs}),
            ...(level === 'line' || value.headers === undefined
                ? {}
                : {headers: headerText(value.headers as Record<string, unknown>)}),
        };
        const body =
            level === 'line' || level === 'headers' ? undefined : bodyText(value.body, level);
        // The body travels *only* as the payload. Writing it into `fields` as well made the record
        // carry it twice, and the retention sweep in the emitter then minted two references to one
        // value — the bulk kept twice, for a duplicate nobody reads (`@@T-730`).
        return {
            summary,
            fields,
            ...(body === undefined ? {} : {payload: body.text}),
            bytes: body?.bytes ?? 0,
            masked,
        };
    },
};

/**
 * The wire frame: `line` → `hex` → `full`.
 *
 * The cheapest rung is what an operator needs from a frame that is not the problem — how long it was and
 * what it opened with — because a socket that carries a hundred messages a second cannot have all of
 * them rendered in full.
 */
export const tcpFrame: ICaptureShape<ITcpFrame> = {
    name: 'tcp.frame',
    levels: ['line', 'hex', 'full'],
    render(frame, level, mask) {
        const {data} = frame;
        const bytes = data.length;
        let masked = 0;
        const copy = new Uint8Array(data);
        for (const rule of mask.bytes ?? []) {
            for (
                let index = rule.offset;
                index < Math.min(rule.offset + rule.length, bytes);
                index += 1
            ) {
                copy[index] = 0;
                masked += 1;
            }
        }
        const hex = (from: number, to: number): string =>
            Array.from(copy.subarray(from, to), byte => byte.toString(16).padStart(2, '0')).join(
                ' ',
            );
        const ascii = (from: number, to: number): string =>
            Array.from(copy.subarray(from, to), byte =>
                byte >= 0x20 && byte < 0x7f ? String.fromCharCode(byte) : '.',
            ).join('');
        const summary = `${frame.direction} ${bytes}B ${hex(0, Math.min(FRAME_PREVIEW, bytes))}`;
        const preview = level === 'line' ? undefined : hex(0, bytes);
        return {
            summary,
            fields: {
                direction: frame.direction,
                bytes,
                ...(level === 'line'
                    ? {}
                    : {ascii: ascii(0, Math.min(bytes, level === 'full' ? bytes : FRAME_PREVIEW))}),
            },
            ...(preview === undefined ? {} : {payload: preview}),
            bytes,
            masked,
        };
    },
};

/**
 * A JSON document: `line` → `keys` → `body`.
 *
 * The shape a Kubernetes event and a protocol body both need: arbitrary data, a size, and a way to see
 * the structure without reading the content.
 */
export const jsonPayload: ICaptureShape<IJsonPayload> = {
    name: 'json',
    levels: ['line', 'keys', 'body'],
    mask: {deep: [{match: /password|secret|token|pin|pan|cvv|iban|msisdn/i}]},
    render(payload, level, mask) {
        const {value, masked} = applyMask(payload.value, mergeMask(jsonPayload.mask, mask));
        const keys =
            value !== null && typeof value === 'object' ? Object.keys(value as object) : [];
        const body = bodyText(value, level === 'body' ? 'body' : 'line');
        const summary =
            `${payload.label ?? 'json'} ${body.bytes}B ${keys.slice(0, 6).join(', ')}`.trim();
        return {
            summary,
            fields: {
                ...(payload.label === undefined ? {} : {label: payload.label}),
                bytes: body.bytes,
                keys,
            },
            // The document itself is the payload, never a field as well — see the exchange above.
            ...(level === 'body' ? {payload: body.text} : {}),
            bytes: body.bytes,
            masked,
        };
    },
};

/** The three shapes the framework ships, by declared name. */
export const shapes: Readonly<Record<string, ICaptureShape>> = {
    [httpExchange.name]: httpExchange as ICaptureShape,
    [tcpFrame.name]: tcpFrame as ICaptureShape,
    [jsonPayload.name]: jsonPayload as ICaptureShape,
};

/**
 * A shape's floor of rules plus what the scope configured.
 *
 * Additive, never subtractive: a scope may add a path of its own (its own secret header) and may raise
 * the rung, but it cannot switch off the floor — a deployment that wants a header out of a capture has
 * no way to ask for `authorization` back, which is the property that makes the default trustworthy
 * (`@@D-906`).
 */
export function mergeMask(floor: IMask | undefined, configured: IMask | undefined): IMask {
    if (!floor) return configured ?? {};
    if (!configured) return floor;
    return {
        paths: [...(floor.paths ?? []), ...(configured.paths ?? [])],
        deep: [...(floor.deep ?? []), ...(configured.deep ?? [])],
        bytes: [...(floor.bytes ?? []), ...(configured.bytes ?? [])],
    };
}
