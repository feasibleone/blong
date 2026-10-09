import {Transform, type TransformCallback} from 'node:stream';
import type PinoPretty from 'pino-pretty';
import pretty from 'pino-pretty';

/**
 * The key the header's two members are carried under, once the line is rewritten.
 *
 * Not `$meta`: that is what the record's own shape calls the envelope, and the detail beneath the
 * message prints whatever is under it. This name is the printer's own — it is read by `messageFormat`
 * below and dropped from the detail by `$metaSlots` in `Log.ts`'s `ignore` list — so it must be
 * spelled the same in both files.
 */
const SLOTS = '$metaSlots';

/**
 * What the header already printed, so the detail beneath it does not repeat it.
 *
 * The list lives here rather than with the transport because this is the half that knows what the
 * line above carries: `messageFormat` renders every one of these, and `$metaSlots` is the rewritten
 * envelope's two members (see {@link withoutSlots}). Keeping the two beside each other is what makes
 * them impossible to disagree about.
 *
 * `pid` and `hostname` are named but never printed by this formatter, and stay in the list for the
 * reason a reader would expect: they are the logger's, not the record's.
 */
const ALREADY_IN_HEADER = [
    'context',
    'prefix',
    'pid',
    'hostname',
    '$metaSlots',
    'req',
    'res',
    'config',
    'configBase',
    'id',
];

/**
 * One log record, with the envelope's two members under a key only the header reads.
 *
 * `messageFormat` below lifts `$meta.mtid` and `$meta.method` onto the header line, and the detail
 * beneath the message printed the same two strings a second time — the duplication the semantic
 * record's own translator stopped (`semanticRecord.ts`). An `ignore` entry per member cannot fix it:
 * pino-pretty's filter deletes the *leaf*, so an envelope that held only those two was left as
 * `{"$meta":{}}`, a key printed with nothing behind it, on every framework record.
 *
 * So the line is rewritten on the way in, before the printer parses it: the two members move to
 * {@link SLOTS}, and what is *left* of the envelope stays under `$meta`. That half matters as much as
 * the first — a `$meta.forward`, a checkpoint, an expected error have no slot of their own, and a
 * reader of the line needs them exactly where the record keeps them.
 *
 * A member that was not lifted stays where it was, because a `mtid` that is not a string never reached
 * the header and moving it would lose what the request carried. A line that does not parse is passed
 * through untouched — pino-pretty cannot read it either, so it prints it as it found it (F-431).
 */
const withoutSlots = (line: string): string => {
    if (!line.includes('"$meta"')) return line;
    try {
        const record = JSON.parse(line) as Record<string, unknown>;
        const envelope = record.$meta;
        if (typeof envelope !== 'object' || envelope === null || Array.isArray(envelope))
            return line;
        const rest = {...(envelope as Record<string, unknown>)};
        const slots: Record<string, string> = {};
        for (const name of ['mtid', 'method'] as const) {
            const value = rest[name];
            if (typeof value !== 'string') continue;
            slots[name] = value;
            delete rest[name];
        }
        if (Object.keys(slots).length > 0) record[SLOTS] = slots;
        if (Object.keys(rest).length > 0) record.$meta = rest;
        else delete record.$meta;
        return JSON.stringify(record);
    } catch {
        return line;
    }
};

export default (options: PinoPretty.PrettyOptions & {refs?: boolean}) => {
    const printer = pretty({
        ...options,
        // Whatever a caller asked to ignore, on top of what the header printed itself.
        ignore: [
            ...ALREADY_IN_HEADER,
            ...(options.ignore ? String(options.ignore).split(',') : []),
        ].join(','),
        messageFormat(
            log: {
                id?: string;
                context?: string;
                prefix?: string;
                [messageKey: string]: unknown;
                config?: unknown;
                configBase?: unknown;
                req?: {
                    method: string;
                    url: string;
                    headers?: Record<string, string>;
                    body?: unknown;
                    json?: unknown;
                };
                res?: {
                    statusCode: number;
                    statusMessage: string;
                    headers?: Record<string, string>;
                    body?: unknown;
                };
                $meta?: {
                    mtid?: string;
                    method?: string;
                };
                $metaSlots?: {
                    mtid?: string;
                    method?: string;
                };
            },
            messageKey,
            levelLabel,
            {colors},
        ) {
            const {id, context, prefix, [messageKey]: message, config, configBase, req, res} = log;
            // The two members the header carries: where the rewrite put them, or still inside the
            // envelope for a caller that hands this formatter a record it did not rewrite.
            const slots = log.$metaSlots ?? log.$meta;
            return [
                // A released process prints no reference (`log.refs: false`): the
                // group is a development aid, and resolving one needs a store open
                // beside the terminal that would print it. Absent means on, which is
                // why this compares against `false` rather than testing the option.
                options.refs === false ? false : id && colors.dim(`semlog://r/${id}`),
                context && colors.greenBright(context),
                prefix,
                slots?.mtid && colors.magenta(slots.mtid),
                slots?.method && colors.yellow(slots.method),
                message,
                config &&
                    `\u001B]8;;blong://json/${JSON.stringify(config)}\u001B\\config\u001B]8;;\u001B\\`,
                configBase,
                req &&
                    !res &&
                    `▶ ${colors.magenta(req.method)} ${colors.yellow(req.url)}${
                        req.headers
                            ? `\n${Object.entries(req.headers)
                                  .map(
                                      ([key, value]) =>
                                          `    ${colors.blue(key)}: ${colors.green(value)}`,
                                  )
                                  .join('\n')}`
                            : ''
                    }`,
                res &&
                    `◀ ${req ? `${colors.magenta(req.method)} ${colors.yellow(req.url)} ` : ''}${colors.blueBright(res.statusCode)}${
                        res.headers
                            ? `\n${Object.entries(res.headers)
                                  .map(
                                      ([key, value]) =>
                                          `    ${colors.blue(key)}: ${colors.green(value)}`,
                                  )
                                  .join('\n')}`
                            : ''
                    }`,
            ]
                .filter(Boolean)
                .join(' ');
        },
    });
    // The printer is written *lines* — one JSON record each — so the rewrite happens on the way in,
    // in front of it. A chunk may hold several records or end mid-record, so only the complete ones
    // are rewritten and the tail is carried to the next chunk: the same buffering the printer does
    // for the text it emits, for the same reason.
    let tail = '';
    const lines = new Transform({
        transform(chunk: Buffer | string, _encoding: string, callback: TransformCallback) {
            const split = (tail + String(chunk)).split('\n');
            tail = split.pop() ?? '';
            callback(null, split.length ? `${split.map(withoutSlots).join('\n')}\n` : '');
        },
        flush(callback: TransformCallback) {
            callback(null, tail ? withoutSlots(tail) : '');
        },
    });
    // What pino writes into is this stream, not the printer: the printer formats what it is given, so
    // the rewrite has to happen before it — and the printer is what the pretty text is written to.
    lines.pipe(printer);
    return lines;
};
