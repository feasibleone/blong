import crypto from 'node:crypto';

import {library} from '@feasibleone/blong';
import {crockfordDecode, crockfordEncode, ulid} from '@feasibleone/blong-lib';

/**
 * adapter/db/core.ts — the helpers the `feedback.db` handlers share (`@@T-469`).
 *
 * Injected, so every handler of the group takes them typed from `lib`:
 *
 *     export default handler(({lib: {uuidBuf, newItemId}}) => ({ … }))
 *
 * The identity helpers exist because the two keys are BINARY(16) on the wire and
 * in the table: a session id is a UUID string, an item id a ULID string, and a
 * hand-written insert has to turn either into the buffer knex expects. A
 * hand-written select has to turn it back, which is what `bufToUuid` is for.
 */

/** Limits of one submission, enforced by `feedback.session.add` (`@@T-469`). */
export const LIMITS = {
    /** Items in one submission. */
    items: 200,
    /** Characters of one comment. */
    comment: 8000,
    /** Characters of a data URL. */
    shotBytes: 8_000_000,
    /** Characters of a reviewer's clarification. */
    refined: 20000,
};

/** A UUID string as the BINARY(16) a `uid` column stores. */
function uuidBuf(uuid: string): Buffer {
    return Buffer.from(uuid.replace(/-/g, ''), 'hex');
}

/** A BINARY(16) value back to a dashed UUID string. */
function bufToUuid(buf: Buffer | string): string {
    if (typeof buf === 'string') return buf;
    const hex = buf.toString('hex');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * The caller's `$meta.auth.actorId` as the BINARY(16) the graph stores.
 *
 * It is not a dashed UUID: the token's `sub` is the crockford rendering of the
 * resource id, and a dashed UUID, hex or base64 string is accepted too for the
 * tests and internal callers. `crockfordEncode` reverses the bytes, so decoding
 * round-trips to the DB order `core_resource.resourceId` uses (`@@F-623`).
 */
function actorBuf(actorId: string | undefined): Buffer | null {
    if (!actorId) return null;
    const dashed = actorId.replaceAll('-', '');
    if (/^[0-9a-f]{32}$/i.test(dashed)) return Buffer.from(dashed, 'hex');
    try {
        const raw = crockfordDecode(actorId.toUpperCase());
        if (raw.length === 16) return Buffer.from(raw);
    } catch {
        // Not crockford — try base64.
    }
    const base64 = Buffer.from(actorId, 'base64');
    return base64.length === 16 ? base64 : null;
}

/** A fresh session id. */
function newUuid(): string {
    return crypto.randomUUID();
}

/** A fresh item id, as the BINARY(16) its `ulid` primary key stores. */
function newItemId(): Buffer {
    return Buffer.from(crockfordDecode(ulid()));
}

/** A BINARY(16) item id back to the ULID string the wire carries. */
function itemIdOf(id: Buffer | string): string {
    if (typeof id === 'string') return id;
    return crockfordEncode(new Uint8Array(id));
}

/** A ULID string — as the wire and the review page carry it — back to its BINARY(16). */
function itemBuf(id: string): Buffer {
    return Buffer.from(crockfordDecode(String(id).trim().toUpperCase()));
}

/** The resource name of a session in the graph. The id makes it unique, the prefix greppable. */
function sessionResourceName(sessionId: string): string {
    return `feedback.session.${sessionId}`;
}

export type FeedbackLib = {
    limits: typeof LIMITS;
    uuidBuf: typeof uuidBuf;
    actorBuf: typeof actorBuf;
    bufToUuid: typeof bufToUuid;
    newUuid: typeof newUuid;
    newItemId: typeof newItemId;
    itemBuf: typeof itemBuf;
    itemIdOf: typeof itemIdOf;
    sessionResourceName: typeof sessionResourceName;
};

export default library(
    (): FeedbackLib => ({
        limits: LIMITS,
        uuidBuf,
        actorBuf,
        bufToUuid,
        newUuid,
        newItemId,
        itemBuf,
        itemIdOf,
        sessionResourceName,
    }),
);
