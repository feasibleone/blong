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
 * 5. `('text %s', value, …)` — pino's other documented form, where the logger itself
 *    substitutes the value. The framework's own call sites never write it, but
 *    dependencies do (`@fastify/bearer-auth` logs a refusal as
 *    `('unauthorized: %s', error.message)`), and a translation that read only the
 *    first argument printed the placeholder and lost the reason. A call in this shape
 *    also carries `site`, the frame that made it, because a message nothing in the
 *    tree wrote is a message whose origin has to be said rather than searched for.
 *
 * `site` is not only for that shape: `callSite` names the caller of any record whose message
 * matches the patterns it lists, which is what a runtime leaves configured while one particular
 * line turns up unexplained in a live process. Nothing is captured for a message that matches
 * none of them, so what it costs is what the matched records cost.
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

/** What a caller of this translation may ask of it. */
export interface LogCallOptions {
    /**
     * The messages whose caller is worth naming: each entry is a regular expression source, so a
     * substring (`unauthorized`, `adapter.ready`) is written as one and `['']` names the caller of
     * every record.
     *
     * A list rather than a switch, because the interesting line is usually one particular message
     * and naming the caller of everything buries it. The framework's log configuration carries
     * this as `log.callSite`, and nothing is captured for a message that matches none of it — so
     * leaving it configured costs what the matched records cost and nothing else.
     */
    callSite?: string | RegExp | readonly (string | RegExp)[];
}

/**
 * Whether a record's message is one whose caller was asked for.
 *
 * A string entry is a regular expression source — `unauthorized` matches the substring, because
 * that is what the expression says — and one that is not a valid expression is looked for as the
 * text it is, so a caller writing `[` or `(` gets what they meant rather than a throw out of the
 * logging path.
 *
 * A single pattern is accepted in place of a list because that is what a command line gives:
 * `--log.callSite=unauthorized` reaches the config as one string, and the option is the same.
 */
export function messageMatches(
    patterns: string | RegExp | readonly (string | RegExp)[] | undefined,
    message: string,
): boolean {
    if (!patterns) return false;
    const list = Array.isArray(patterns) ? patterns : [patterns];
    if (list.length === 0) return false;
    return list.some(pattern => {
        if (pattern instanceof RegExp) return pattern.test(message);
        try {
            return new RegExp(pattern).test(message);
        } catch {
            return message.includes(pattern);
        }
    });
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
 * A value as text, for a placeholder that wants JSON and for a value appended after
 * the message.
 *
 * Total like the rest of this module: a cycle, a `BigInt` or a function has no JSON
 * form, and throwing out of the logging path is the one failure this file exists to
 * prevent — so anything `JSON.stringify` refuses falls back to `String`.
 */
function readable(value: unknown): string {
    if (typeof value === 'string') return value;
    try {
        return JSON.stringify(value) ?? String(value);
    } catch {
        return String(value);
    }
}

/**
 * Substitute a message's placeholders the way the logger the caller wrote against would.
 *
 * `%s` and `%d` are `String`, `%j` and `%o` are `readable`, and a placeholder with no
 * value left is kept as written rather than replaced by `undefined`. What the
 * placeholders did not consume is appended, which is what `util.format` does with a
 * trailing argument and the reason a call that carried a value and wrote no
 * placeholder still says it.
 */
function interpolate(message: string, values: unknown[]): string {
    let used = 0;
    const filled = message.replace(/%s|%d|%j|%o|%%/g, match => {
        if (match === '%%') return '%';
        if (used >= values.length) return match;
        const value = values[used++];
        return match === '%j' || match === '%o' ? readable(value) : String(value);
    });
    if (used >= values.length) return filled;
    return [filled, ...values.slice(used).map(readable)].join(' ');
}

/**
 * The files a call passes through between its site and this module.
 *
 * Deliberately exact rather than a package prefix: this module's own *tests* live under the
 * same directory, and a test that logs is a call site like any other — a filter that matched
 * `semantic-log` as a whole would name the runner instead of the test.
 */
const LOGGING_FRAME =
    /[\\/]semantic-log[\\/]src[\\/](?:logCall|emitter|logger|logBase|writer|render|service|buffer)\.(?:ts|js)m?(?::|\?|$)|[\\/](?:semanticRecord|SemanticLog)\.(?:ts|js)m?(?::|\?|$)/;

/**
 * The frame that made the call, skipping the logging path itself.
 *
 * A stack from here runs through the logger, the emitter's own wrappers and — for a
 * framework call — the envelope adapter that translated it, so the first frame outside
 * all of those is the one worth naming. It is read for a call in pino's printf shape,
 * which no call site in this repository writes, and for every call when `callSite` is
 * asked for; the record then says where it came from instead of leaving the reader to
 * walk the tree looking for the message.
 *
 * `extra` is for a caller that is itself part of a logging path — the pino transport's
 * mixin, say — and has to add its own file to the ones that do not count.
 */
export function callerSite(extra?: RegExp): string | undefined {
    const frames = (new Error().stack ?? '').split('\n').slice(1);
    const frame = frames.find(
        line => line.includes('at ') && !LOGGING_FRAME.test(line) && !extra?.test(line),
    );
    return frame?.trim().replace(/^at /, '');
}

/**
 * The record, with the caller named when it was asked for — or when the call needed one.
 *
 * A call in pino's printf shape is named whatever the configuration says: no call site in this
 * repository writes that shape, so one arriving is either a dependency's or a new one, and both
 * are worth placing. Otherwise the message decides: a record whose text matches `callSite` names
 * its caller, and one that matches nothing is left exactly as it was.
 */
function withSite(call: LogCall, options: LogCallOptions, always: boolean): LogCall {
    if (!always && !messageMatches(options.callSite, call.msg)) return call;
    return {...call, fields: {...call.fields, site: callerSite()}};
}

/**
 * Translate one pino-shaped log call's arguments into a message and a field bag.
 *
 * Total by construction: a call with no arguments, or with a first argument that is
 * none of the shapes above, still produces a record — `String(first)` is the last
 * resort, so a caller that logs something unexpected gets a line rather than a
 * throw out of the logging path.
 */
export function toLogCall(args: unknown[], options: LogCallOptions = {}): LogCall {
    const [first, second] = args;
    const trailing = isBag(second) ? second : undefined;
    // pino's canonical order is `(bag, message)`, so a string in the second position
    // is the text that belongs beside the bag — not a second bag.
    const beside = text(second);

    if (typeof first === 'string') {
        // A *value* beside the text is pino's printf form, which the logger itself fills in —
        // the shape `@fastify/bearer-auth` logs a refusal in, and the reason a translation
        // that read only the first argument printed `%s` and lost the reason. A bag beside it
        // is pino's canonical order (fields, no interpolation), and a bag among values is
        // both: substituted where a placeholder asks for it, merged as fields regardless.
        const rest = args.slice(1);
        const fields = {...trailing, ...Object.assign({}, ...rest.filter(isBag))};
        // A placeholder in the text, or a value beside it, is the logger filling the message in;
        // an object among those values is *both* substituted and merged, which is how pino treats
        // `('created %j', record)`. Only a text that asks for nothing is the canonical order —
        // exactly the distinction a message with a placeholder in it used to lose.
        const asked = /%s|%d|%j|%o|%%/.test(first) || rest.some(value => !isBag(value));
        if (!asked) return withSite({msg: first, fields}, options, false);
        return withSite({msg: interpolate(first, rest), fields}, options, true);
    }

    if (first instanceof Error) {
        // `err` is one of the slots the emitter lifts, so an error logged as the
        // message still renders as an error block rather than as text.
        return withSite(
            {msg: beside ?? first.message, fields: {err: first, ...trailing}},
            options,
            false,
        );
    }

    if (isBag(first)) {
        // `message`/`msg` become the record's message, so they are not fields too;
        // `operation` and `messageId` are already the slots the emitter lifts, and
        // are carried through untouched.
        const {message, msg, ...rest} = first;
        const fields: Record<string, unknown> = {...rest, ...trailing};
        return withSite({msg: beside ?? text(message) ?? text(msg) ?? '', fields}, options, false);
    }

    return withSite(
        {msg: beside ?? (first === undefined ? '' : String(first)), fields: {...trailing}},
        options,
        false,
    );
}
