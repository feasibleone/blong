/**
 * The pino dialect, translated into the emitter's record model.
 *
 * The emitter's logger takes a message *and* a field bag; pino's call sites take
 * them in either order, accept a bare string, an `Error`, or a bag alone, and lift
 * nothing out of any of them. The emitter lifts `err`, `req`, `res`, `messageId`
 * and `operation` out of the bag into slots of their own. Every shape a pino-shaped
 * caller actually uses is therefore translated here, in one place, rather than at
 * each call site:
 *
 * 1. `(obj, 'text')` — pino's canonical form.
 * 2. `(error)` — an `Error` as the only argument.
 * 3. `(obj)` — a bag with no text.
 * 4. `('text')` — a bare message.
 *
 * A bag's `message`/`msg` becomes the record's message, and its `operation` and
 * `messageId` are kept as the slots they already are, so a caller that speaks
 * pino gets the header it expects without changing. Everything else is carried
 * through as fields, untouched.
 *
 * A runtime with an envelope of its own — something that turns a *structured* log
 * call into a message and operation — layers on top of this, because that envelope
 * is the runtime's vocabulary and this module deliberately knows none: see
 * `@feasibleone/blong-gogo`'s `semanticRecord.ts` for one that lifts `$meta`.
 */

/** A record's message and the field bag it carries, as the emitter wants them. */
export interface LogCall {
    msg: string;
    fields: Record<string, unknown>;
}

/**
 * Is this a field bag? An array, an `Error`, `null` and any scalar are not: pino
 * accepts all of them in the bag's position, and none of them is a set of named
 * fields to merge.
 */
function isBag(value: unknown): value is Record<string, unknown> {
    return (
        typeof value === 'object' &&
        value !== null &&
        !Array.isArray(value) &&
        !(value instanceof Error)
    );
}

/** Read a string property without letting a non-string through. */
function text(value: unknown): string | undefined {
    return typeof value === 'string' ? value : undefined;
}

/**
 * Translate one pino-shaped log call's arguments into a message and a field bag.
 *
 * Total by construction: a call with no arguments, or with a first argument that is
 * none of the shapes above, still produces a record — `String(first)` is the last
 * resort, so a caller that logs something unexpected gets a line rather than a
 * throw out of the logging path.
 */
export function toLogCall(args: unknown[]): LogCall {
    const [first, second] = args;
    const trailing = isBag(second) ? second : undefined;
    // pino's canonical order is `(bag, message)`, so a string in the second position
    // is the text that belongs beside the bag — not a second bag.
    const beside = text(second);

    if (typeof first === 'string') {
        return {msg: first, fields: {...trailing}};
    }

    if (first instanceof Error) {
        // `err` is one of the slots the emitter lifts, so an error logged as the
        // message still renders as an error block rather than as text.
        return {msg: beside ?? first.message, fields: {err: first, ...trailing}};
    }

    if (isBag(first)) {
        // `message`/`msg` become the record's message, so they are not fields too;
        // `operation` and `messageId` are already the slots the emitter lifts, and
        // are carried through untouched.
        const {message, msg, ...rest} = first;
        const fields: Record<string, unknown> = {...rest, ...trailing};
        return {msg: beside ?? text(message) ?? text(msg) ?? '', fields};
    }

    return {msg: beside ?? (first === undefined ? '' : String(first)), fields: {...trailing}};
}
