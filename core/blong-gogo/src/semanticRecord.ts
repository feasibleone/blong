/**
 * blong's log calls, in the emitter's record model.
 *
 * The dialect itself is shared — every pino-shaped call shape is translated by
 * `@feasibleone/semantic-log/emitter`'s `toLogCall` — and this adds the one part
 * that is blong's own: the `$meta` envelope, whose `method` and `mtid` the
 * framework's pino formatter printed beside the message.
 */

import type {LogCall} from '@feasibleone/semantic-log/emitter';
import {toLogCall as translate} from '@feasibleone/semantic-log/emitter';

export type {LogCall};

/** Read a string property without letting a non-string through. */
function text(value: unknown): string | undefined {
    return typeof value === 'string' ? value : undefined;
}

/**
 * Translate one framework log call's arguments into a message and a field bag.
 *
 * The shared translation runs first, so everything that is not the envelope — a
 * bare message, an `Error`, a bag on its own, the canonical `(bag, message)`
 * order — behaves here exactly as it does for any other emitter user. Then the
 * envelope's two fields become the record's own slots, which is what puts them in
 * the header instead of in the detail beneath it, and they win over the same keys
 * on the bag itself: the envelope is the newer, structured source.
 *
 * The envelope stays in the fields as well, so a reader still sees the request it
 * came from.
 */
export function toLogCall(args: unknown[]): LogCall {
    const call = translate(args);
    const {fields} = call;
    const envelope = fields.$meta;
    if (envelope === undefined) {
        delete fields.$meta;
        return call;
    }
    const meta =
        typeof envelope === 'object' && envelope !== null
            ? (envelope as {mtid?: unknown; method?: unknown})
            : undefined;
    const operation = text(meta?.method) ?? text(fields.operation);
    if (operation !== undefined) {
        fields.operation = operation;
    }
    const messageId = text(meta?.mtid) ?? text(fields.messageId);
    if (messageId !== undefined) {
        fields.messageId = messageId;
    }
    return call;
}
