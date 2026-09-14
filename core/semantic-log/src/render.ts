/**
 * Standard rendered format (PRD R20) and the reference rendering (PRD R19).
 *
 * The header is always exactly one line; optional detail is indented beneath
 * it. Detail is rendered as labelled structured lines — never a raw object
 * dump — because the spec's acceptance criteria say so in as many words.
 *
 * Rendering is a pure read: the record is never mutated, so a caller may cache
 * a record and render it more than once.
 */

import {LEVELS, levelName, levelValue, type LevelName} from './level.ts';
import type {Decision, LogRecord} from './record.ts';
import {PAYLOAD_THRESHOLD, encodeSegment, refUri} from './refs.ts';

export interface RenderOptions {
    /** ANSI colour. Defaults to false so tests and pipes get plain text. */
    color?: boolean;
    /** Injectable clock for deterministic tests. */
    formatTime?: (time: number) => string;
}

const ANSI = {
    reset: '\u001B[0m',
    dim: '\u001B[2m',
    red: '\u001B[31m',
    green: '\u001B[32m',
    yellow: '\u001B[33m',
    blue: '\u001B[34m',
    magenta: '\u001B[35m',
    cyan: '\u001B[36m',
} as const;

const LEVEL_COLOR: Record<number, string> = {
    10: ANSI.dim,
    20: ANSI.blue,
    30: ANSI.green,
    40: ANSI.yellow,
    50: ANSI.red,
    60: ANSI.red,
};

/** Shown when the timestamp cannot be rendered as an instant. */
const TIME_WITHHELD = '[time withheld]';

/** Shown when the message cannot even be turned into a string. */
const UNREADABLE = '[unreadable]';

/** C0 controls and DEL: every character that could carry line or terminal structure. */
const CONTROL_CHARS = /[\u0000-\u001F\u007F]/g;

/**
 * Replace the characters that carry line or terminal structure with spaces.
 *
 * The header must be exactly one line (PRD R20), and an indented detail line
 * must not be able to forge another line. Both are built from caller-supplied
 * text — the message, a field key or value, a request target, an error message,
 * a trace-derived label — and a `\n` in any of them would start a new,
 * unindented line that a reader or a fixed-pattern extractor cannot tell from a
 * real one. C0 also covers `\u001B`, so a value cannot inject terminal colour
 * or an OSC 8 sequence into the rendered form either.
 *
 * Every part of the rendered form passes through here, the error block's stack
 * frames included, so the guarantee is about the whole rendered record rather
 * than the header alone.
 *
 * The value is not assumed to be a string: a redaction pattern can replace a
 * structured slot with the `[redacted]` placeholder, so a later read may find a
 * scalar where the type says `FlowState`. Coercing first keeps those records
 * rendering (as they did through the interpolation this replaced) instead of
 * dropping the whole record to the last-resort line.
 */
function sanitise(value: unknown): string {
    return String(value).replace(CONTROL_CHARS, ' ');
}

function defaultFormatTime(time: number): string {
    return new Date(time).toISOString();
}

/**
 * Format a record's timestamp without assuming the slot still holds an instant.
 *
 * A configured `redact` pattern can replace `time` with the `[redacted]`
 * placeholder (or collapse the whole record with `**`), and
 * `new Date('[redacted]').toISOString()` throws a `RangeError` out of the log
 * call. A non-finite value is shown as an explicit marker rather than a
 * silently wrong date; a real instant is handed to the configured formatter
 * unchanged, so a record that was not redacted renders exactly as before.
 */
function renderTime(time: unknown, format: (time: number) => string): string {
    return typeof time === 'number' && Number.isFinite(time) ? format(time) : TIME_WITHHELD;
}

/** Render the references as a fixed-shape, greppable trailing group. */
function renderRefs(record: LogRecord): string {
    const parts = [`r=${refUri('record', record.refs.record)}`];
    if (record.refs.template) {
        parts.push(`t=${refUri('template', record.refs.template)}`);
    }
    if (record.refs.trace) {
        parts.push(`x=${refUri('trace', record.refs.trace)}`);
    }
    if (record.refs.parent) {
        // Deliberately the bare id rather than a `semantic-log://record/...`
        // URI — the reference group is grep-shaped and the parent is a link
        // *within* the r= family — but the id is still untrusted text when the
        // record is re-rendered from a store, so it goes through the same
        // encoder the URIs use. Without it a `refs.parent` of
        // `x] [r=semantic-log://record/ATTACKER` would close the group and forge
        // a reference (see `refs.ts`).
        parts.push(`p=${encodeSegment(record.refs.parent)}`);
    }
    return `[${parts.join(' ')}]`;
}

/** The single-line header: time, level, service, correlators, message, refs. */
function header(record: LogRecord, options: RenderOptions): string {
    const formatTime = options.formatTime ?? defaultFormatTime;
    const paint = options.color
        ? (code: string, text: string): string => `${code}${text}${ANSI.reset}`
        : (_code: string, text: string): string => text;
    const parts = [
        renderTime(record.time, formatTime),
        paint(LEVEL_COLOR[record.level] ?? '', levelName(record.level).padEnd(5)),
        paint(ANSI.cyan, sanitise(record.service)),
    ];
    if (record.context) parts.push(sanitise(record.context));
    if (record.messageId) parts.push(sanitise(record.messageId));
    if (record.operation) parts.push(sanitise(record.operation));
    if (record.flow) {
        const index = record.flow.index ?? -1;
        parts.push(
            `flow=${sanitise(record.flow.id)}/${sanitise(record.flow.step ?? '-')}#${index}`,
        );
        // The leg (PRD R22) follows the position it belongs to, as a token of its
        // own: `flow=<id>/<step>#<index>` stays exactly what it was, so a reader or a
        // test parsing the position is unaffected by a record that also names the
        // call it is part of. Its position in the execution rides the same token
        // (`leg=<id>#<seq>`), the way the flow's position rides the flow token, so
        // two lines of one execution can be ordered by reading them.
        if (record.flow.leg) {
            const seq = record.flow.legSeq === undefined ? '' : `#${sanitise(record.flow.legSeq)}`;
            parts.push(`leg=${sanitise(record.flow.leg)}${seq}`);
        }
    }
    if (record.intent) parts.push(`intent=${sanitise(record.intent.name)}`);
    parts.push(sanitise(record.msg));
    // The version of the base fields rides the header too (§5.1 "Base fields
    // (pid, hostname, service, version)"). It is placed *after* R20's normative
    // details — timestamp, level, service, context, message id, operation,
    // message — so that order stays intact, and before the reference group,
    // which stays last. `version=` rather than a bare token keeps it distinct
    // from the message it follows.
    if (record.version) parts.push(`version=${sanitise(record.version)}`);
    parts.push(renderRefs(record));
    return parts.filter(Boolean).join(' ');
}

/** An indented detail line: two-space block indent, label, two-space gap. */
function blockLine(label: string, text: string): string {
    return `  ${label}  ${text}`;
}

function keyValues(prefix: string, values: Record<string, string> | undefined): string[] {
    if (!values) return [];
    return Object.entries(values).map(
        ([key, value]) => `${prefix}${sanitise(key)}: ${sanitise(value)}`,
    );
}

/** Values that have no meaningful text form in a log line. */
function isSkippedField(value: unknown): boolean {
    return value === undefined || typeof value === 'function' || typeof value === 'symbol';
}

/**
 * Serialise one field value without ever throwing: `JSON.stringify` rejects
 * circular structures and `BigInt`, and returns `undefined` for a value with
 * no text form, which would print the literal text `undefined`. Callers skip
 * such values first; anything that still fails survives as an explicit marker
 * so a single field can never lose the rest of the record.
 *
 * Exported because the logger must judge a field's size by exactly the text this
 * renderer will produce (PRD R19/R20): the decision to retain a payload and the
 * decision to render its reference are the two halves of one threshold, and
 * measuring them with two different serialisations is how they would drift.
 */
export function renderField(value: unknown): string {
    if (typeof value === 'string') return value;
    try {
        return JSON.stringify(value) ?? '[unserializable]';
    } catch {
        return '[unserializable]';
    }
}

/**
 * Render a rationale that redaction may have collapsed.
 *
 * A configured pattern can replace the whole `decision` slot with the
 * `[redacted]` placeholder (`decision`, `**`) or only its candidate list
 * (`decision.candidates`, `decision.*`) with that string, so the value here is
 * not necessarily a `Decision` even though the type says so. This guard mirrors
 * `serializeForIdentity`'s: the discriminator and chosen branch still render,
 * and a candidate list that is no longer an array is omitted rather than
 * calling `.join` on a string. A wholly collapsed slot keeps its placeholder
 * text (handled by the caller), so the withheld rationale stays visible.
 */
function decisionDetail(decision: Decision): string {
    const {discriminator, chosen, candidates} = decision;
    const head = `${discriminator} -> ${chosen}`;
    return Array.isArray(candidates) ? `${head} (of ${candidates.join(', ')})` : head;
}

/**
 * Read one slot without letting a throw escape.
 *
 * This exists for the last-resort reconstruction below, which runs only because
 * rendering already threw once: a value that broke `JSON.stringify` may be a
 * getter that throws on access, so every read on this path is guarded. It is a
 * property of the fallback itself, not a guard repeated at each call site.
 */
function guardedRead<T>(source: () => T, fallback: T): T {
    try {
        return source();
    } catch {
        return fallback;
    }
}

/**
 * Rebuild the smallest readable form of a record.
 *
 * A record that defeated the ordinary render is still a record: a process
 * failure must be reported rather than lost because one value in it was
 * hostile. Every slot is read behind `guardedRead` and coerced to a string, so
 * the result is built from primitives alone and cannot fail again — not while
 * it is assembled and not when it is serialised.
 */
/**
 * Resolve the numeric level of a salvage payload.
 *
 * A normal record stores the number in `level` and its name in `levelName`, and
 * the payload has to match that shape: a consumer parsing `level` as a number
 * must not be handed the name. A `redact` pattern can replace the slot with the
 * `[redacted]` placeholder, so the value is not assumed to be a level at all —
 * anything that does not resolve to a finite number is reported as `info`.
 */
function salvageLevel(value: unknown): number {
    const resolved: unknown = guardedRead(
        () => levelValue(value as LevelName | number),
        LEVELS.info,
    );
    return typeof resolved === 'number' && Number.isFinite(resolved) ? resolved : LEVELS.info;
}

function salvage(record: LogRecord): {
    id: string;
    time: string;
    level: number;
    levelName: string;
    service: string;
    msg: string;
} {
    const level = salvageLevel(record.level);
    return {
        id: guardedRead(() => String(record.id), ''),
        time: guardedRead(() => new Date(record.time).toISOString(), TIME_WITHHELD),
        level,
        levelName: levelName(level),
        service: guardedRead(() => String(record.service), ''),
        msg: guardedRead(() => String(record.msg), UNREADABLE),
    };
}

/** A one-line JSON object rebuilt from primitives, so serialising it cannot fail. */
function salvageJson(record: LogRecord): string {
    const {id, time, level, levelName, service, msg} = salvage(record);
    return JSON.stringify({id, time, level, levelName, service, msg, refs: {record: id}});
}

/**
 * One greppable line rebuilt from primitives, so assembling it cannot fail.
 *
 * `service` and `msg` are caller text and pass through `sanitise` here too: a
 * newline in either would split the salvaged line, which is the one thing the
 * salvage exists to avoid — the whole record would then be read as a record
 * that is not one.
 */
function salvageHuman(record: LogRecord): string {
    const {id, time, levelName, service, msg} = salvage(record);
    return `${time} ${levelName.padEnd(5)} ${sanitise(service)} ${sanitise(msg)} [r=${refUri('record', id)}]`;
}

/**
 * Render a record for a human reading a terminal.
 *
 * Total by construction: the header, the labelled blocks and the field lines
 * are each built from values the caller may have supplied, and any one of them
 * can throw (`new Date(1e30).toISOString()`, a `toJSON` that throws, a getter on
 * the fields bag). A logging call that throws defeats the log — in JSON mode
 * `fatal` is what the process-failure hooks call, so a throw there escapes the
 * `uncaughtException` listener and aborts Node instead of reporting it. The one
 * boundary here therefore catches whatever the render attempts and falls back
 * to a minimal reconstructed line, rather than a guard beside every read.
 */
export function renderHuman(record: LogRecord, options: RenderOptions = {}): string {
    try {
        const resolved: RenderOptions = {
            color: options.color ?? false,
            formatTime: options.formatTime,
        };
        const lines = [header(record, resolved)];

        if (record.req) {
            const request = [record.req.operation, record.req.target].filter(Boolean).join(' ');
            lines.push(blockLine('request', sanitise(request)));
            lines.push(...keyValues('    ', record.req.headers));
        }
        if (record.res) {
            const elapsed =
                record.res.elapsedMs === undefined ? '' : ` (${record.res.elapsedMs}ms)`;
            lines.push(blockLine('response', `${record.res.status}${elapsed}`));
            lines.push(...keyValues('    ', record.res.headers));
        }
        if (record.err) {
            lines.push(
                blockLine(
                    'error',
                    sanitise([record.err.type, record.err.message].filter(Boolean).join(': ')),
                ),
            );
            if (record.err.stack) {
                // A stack routinely embeds the message, so an escape sequence in
                // a failure reaches this block through the frames as well as
                // through the message line above. Sanitising each frame is what
                // makes the C0 guarantee true of the whole rendered form.
                lines.push(
                    ...record.err.stack.split('\n').map(frame => `    ${sanitise(frame.trim())}`),
                );
            }
        }
        if (record.decision) {
            const decision: unknown = record.decision;
            const detail =
                typeof decision === 'object'
                    ? decisionDetail(decision as Decision)
                    : renderField(decision);
            lines.push(blockLine('decision', sanitise(detail)));
        }
        if (record.fields) {
            // A field line is `  key: value`, so the colon distinguishes it from
            // a labelled block (`  label  text`); sanitising both the key and the
            // value is what keeps a caller's text from forging a second line that
            // has neither.
            const payloads = record.refs.payloads;
            for (const [key, value] of Object.entries(record.fields)) {
                if (isSkippedField(value)) continue;
                const text = renderField(value);
                const payload = payloads?.[key];
                // A large embedded value renders as its payload reference instead
                // of inlining the whole thing (PRD R19/R20: "a reference for any
                // large embedded configuration value"). The id comes from the
                // record's own `refs.payloads`, which the logger writes exactly
                // when it retained the payload, and the *threshold* is re-checked
                // here so this is still a size rule rather than a marker. Both
                // halves are load-bearing: without the index there is no id, and
                // without the check a record that named a payload for a short
                // value would hide the value behind a reference that adds nothing.
                //
                // A value with no index entry inlines. That is the common case and
                // the honest one: a record assembled by hand, or by a build with no
                // store configured, has no retained payload, and a reference to a
                // payload nothing holds is a dead link — worse than a long line.
                const rendered =
                    payload !== undefined && text.length >= PAYLOAD_THRESHOLD
                        ? refUri('payload', payload)
                        : sanitise(text);
                lines.push(`  ${sanitise(key)}: ${rendered}`);
            }
        }
        return lines.join('\n');
    } catch {
        return salvageHuman(record);
    }
}

/**
 * Build a replacement function that keeps `JSON.stringify` total while still
 * emitting one parseable object per record (PRD R18). A circular reference is
 * replaced by an explicit marker and a `BigInt` by its decimal text; every
 * other value is returned unchanged, so an ordinary record serialises
 * byte-identically to a plain `JSON.stringify(record)`.
 *
 * A replacer — not a `try`/`catch` — is deliberate: catching and discarding
 * would lose the record, including the failure record a process-failure hook is
 * trying to emit.
 *
 * `this` inside the replacer is the object currently being serialised, so only
 * the ancestors of that object can be the value's cycle; popping anything
 * deeper lets a value shared by two sibling keys serialise twice instead of
 * being mistaken for a cycle.
 */
function createJsonReplacer(): (this: unknown, key: string, value: unknown) => unknown {
    const ancestors: object[] = [];
    return function (this: unknown, _key: string, value: unknown): unknown {
        if (typeof value === 'bigint') {
            return value.toString();
        }
        if (typeof value !== 'object' || value === null) {
            return value;
        }
        while (ancestors.length > 0 && ancestors[ancestors.length - 1] !== this) {
            ancestors.pop();
        }
        if (ancestors.includes(value)) {
            return '[Circular]';
        }
        ancestors.push(value);
        return value;
    };
}

/**
 * Render a record as one JSON object — the machine-readable mode. Total: a
 * circular reference or a `BigInt` in any nested field is serialised with a
 * marker, and a value that still defeats `JSON.stringify` — a `toJSON` that
 * throws, a getter it reaches while walking — is reported through a minimal
 * reconstructed object rather than escaping the log call. The replacer alone is
 * not enough: it only rewrites the values it is handed, and `toJSON` runs before
 * it is ever called.
 */
export function renderJson(record: LogRecord): string {
    try {
        return JSON.stringify(record, createJsonReplacer());
    } catch {
        return salvageJson(record);
    }
}
