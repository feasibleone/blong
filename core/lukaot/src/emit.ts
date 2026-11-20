/**
 * Emission: one reached call becomes one record, and the record's identity is the identifier.
 *
 * Everything a reader needs is on it — the identifier (which *is* the identity, `@@D-889`), the
 * level the policy resolved to, the message with its values filled in, the parameters as they were
 * supplied, the site the vocabulary was read from and the ambient identity the call sits inside.
 * Nothing is derived from the text: a reworded message is the same record, and two spellings of one
 * value are two values.
 *
 * A value a message interpolates but the call did not supply is printed as `?name?` rather than
 * dropped, because a hole in a line is indistinguishable from a line that never had the field.
 */

import type {ISignal, LevelName} from './declare.ts';
import type {ISite} from './proxy.ts';
import type {SignalRegistry} from './registry.ts';

/** The ambient identity a record inherits — the trace, flow and leg the context supplies. */
export interface IIdentity {
    trace?: string;
    flow?: string;
    flowKind?: string;
    leg?: string;
    step?: string;
    [key: string]: unknown;
}

/** One thing that happened, as it is handed to the writer. */
export interface ISignalRecord {
    /** The declared identifier, which is the record's identity. */
    signal: string;
    /** Which kind of declaration produced it. */
    kind: 'log' | 'error';
    /** The level the policy resolved to at the moment of the call. */
    level: LevelName;
    /** The declared message with its values interpolated. */
    message: string;
    /** The values the call supplied, as they were supplied. */
    params?: unknown;
    /** Where the vocabulary was reached from. */
    site?: ISite;
    /** The ambient identity of the call, when there is one. */
    identity?: IIdentity;
    /**
     * The envelope the framework's output reads: the record's kind and the method it is about.
     *
     * Carried on the record because the two are declared, not passed — and because a writer has to put
     * them where the printer looks (`{$meta: {mtid, method}}`), which it cannot do from a name alone.
     * `method` arrives already interpolated: the declaration may name a value only the call has.
     */
    mtid?: string;
    method?: string;
    /** When the record was made, in epoch milliseconds. */
    time: number;
}

/** What the emitter needs to build and place a record. */
export interface IEmitterOptions {
    /** The declaration and the policy. */
    registry: SignalRegistry;
    /** Where a record goes — the transport, a test's array, or nothing at all. */
    write: (record: ISignalRecord) => void;
    /** The clock, so a test can pin the time. */
    now?: () => number;
    /** The ambient identity, read at emission so a call inside a flow carries it. */
    identity?: () => IIdentity | undefined;
}

/** A `{name}` placeholder in a declared message. */
const PLACEHOLDER = /\{([^}]*)\}/g;

/** The values a call supplied, as a lookup, so a nested object cannot throw the record away. */
function valuesOf(params: unknown): Record<string, unknown> {
    return params !== null && typeof params === 'object' ? (params as Record<string, unknown>) : {};
}

/**
 * The declared message with its values filled in.
 *
 * A placeholder whose value did not arrive keeps its name and gains a question mark, which is the
 * spelling the realm that wrote `?name?` already used — so a repaired message reads the same way a
 * reader of the old one expected.
 */
export function render(message: string, params: unknown): string {
    const values = valuesOf(params);
    return message.replace(PLACEHOLDER, (_, name: string) =>
        values[name] === undefined || values[name] === null ? `?${name}?` : String(values[name]),
    );
}

/**
 * Build the emitter the proxy calls.
 *
 * One record per reached call: the sampler has already decided whether this call is recorded, so the
 * emitter's only accounting is `emitted` — a counter the report reads beside `reached`, which is how
 * a reader tells "the code never asked" from "the policy said no".
 */
export function createEmitter(
    options: IEmitterOptions,
): (signal: ISignal, params: unknown, site: ISite | undefined) => void {
    const {registry, write, now = Date.now, identity} = options;
    return (signal, params, site) => {
        const policy = registry.policy(signal.id);
        const ambient = identity?.();
        const record: ISignalRecord = {
            signal: signal.id,
            kind: signal.kind,
            level: policy.level,
            message: render(signal.message, params),
            // The envelope, interpolated like the message: a declaration states the kind of record and
            // the method it is about, and only the method may name a value the call supplies.
            ...(signal.kind === 'log' && signal.mtid !== undefined ? {mtid: signal.mtid} : {}),
            ...(signal.kind === 'log' && signal.method !== undefined
                ? {method: render(signal.method, params)}
                : {}),
            ...(params === undefined ? {} : {params}),
            ...(site === undefined ? {} : {site}),
            ...(ambient === undefined ? {} : {identity: ambient}),
            time: now(),
        };
        registry.count(signal.id, 'emitted');
        write(record);
    };
}
