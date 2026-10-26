import crypto from 'node:crypto';

import {type IMeta, library} from '@feasibleone/blong';

type KnexQb = any;

/**
 * Shared DB helpers for the core realm — UUID <-> BINARY(16) conversion and
 * `core_type`/`core_resource` graph utilities.
 *
 * Injected: every handler of the `core.db` group receives them from `lib` and
 * takes the type from here, so the call sites stay typed:
 *
 *     const core = lib as unknown as CoreLib;
 *     const {resourceId} = await core.ensureType(queryBuilder, 'party.unit');
 */

/** Convert a UUID string to a BINARY(16) Buffer for MySQL. */
function uuidBuf(uuid: string): Buffer {
    return Buffer.from(uuid.replace(/-/g, ''), 'hex');
}

/** Read a BINARY(16) value from MySQL and return a hex (dashed) UUID string. */
function bufToUuid(buf: Buffer | string): string {
    if (typeof buf === 'string') return buf;
    const hex = buf.toString('hex');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Generate a random UUID v4 string. */
function newUuid(): string {
    return crypto.randomUUID();
}

/** Ensure a core_type row exists for the given alias, returning its integer typeId. */
async function ensureType(qb: KnexQb, typeAlias: string): Promise<number> {
    const row = await qb.select('typeId').from('core_type').where({typeAlias}).first();
    if (row) return row.typeId;
    await qb('core_type').insert({typeAlias}).onConflict().ignore();
    const inserted = await qb.select('typeId').from('core_type').where({typeAlias}).first();
    return inserted!.typeId;
}

/**
 * Next value for a UNIQUE counter column, starting at 0.
 *
 * The value is `max(high-water mark, MAX(column)) + 1`.  Such a counter is part of
 * the record's identity on the wire — an `access_role.roleBit` is the bit
 * *position* of the role in a minted token's `per` permission mask — so handing a
 * freed value to a new record could silently give a still-valid token the new
 * record's permissions.  Gaps after a delete are the price, and they are
 * harmless.
 *
 * `MAX(column)` alone is not enough to keep that promise: deleting the row that
 * owns the current maximum lowers `MAX`, so the next allocation would be handed
 * exactly the bit that a live token still carries (T-169).  The mark in
 * `core_counter` is what makes the promise true, and it is seeded from `MAX` the
 * first time a column is allocated, so an existing database needs no migration.
 *
 * The mark is written by the returned `commit`, not here — the caller commits it
 * once the row actually exists.  An attempt that loses a race must not advance the
 * mark: with three attempts and a busy table, committing eagerly burns the space
 * several values at a time and reaches the ceiling with most values unused (the
 * first version of this did exactly that).
 *
 * Throws when the space is exhausted rather than wrapping around.
 */
async function nextCounter(
    qb: KnexQb,
    table: string,
    column: string,
    max: number,
): Promise<{value: number; commit: () => Promise<void>}> {
    const row = (await qb(table).max(`${column} as value`).first()) as
        | {value?: number | string | null}
        | undefined;
    const highest = Number(row?.value ?? -1);
    const counterName = `${table}.${column}`;
    const mark = await readCounter(qb, counterName);
    const value = Math.max(Number.isFinite(highest) ? highest : -1, mark) + 1;
    if (!Number.isFinite(value) || value > max) {
        throw new Error(`No free ${table}.${column} left (the highest allowed value is ${max})`);
    }
    return {value, commit: () => writeCounter(qb, counterName, value)};
}

/** The high-water mark of a counter, or -1 when it has never been allocated. */
async function readCounter(qb: KnexQb, counterName: string): Promise<number> {
    const row = (await qb('core_counter').select('counterValue').where({counterName}).first()) as
        | {counterValue?: number | string | null}
        | undefined;
    const value = Number(row?.counterValue ?? -1);
    return Number.isFinite(value) ? value : -1;
}

/**
 * Raise a counter's high-water mark.
 *
 * `GREATEST` rather than a plain overwrite: two allocations that race each write
 * a value, and the loser's value — computed before the winner's row was visible —
 * must not lower the mark and hand the winner's value out again.
 */
async function writeCounter(qb: KnexQb, counterName: string, counterValue: number): Promise<void> {
    await qb('core_counter')
        .insert({counterName, counterValue})
        .onConflict('counterName')
        .merge({counterValue: qb.raw('GREATEST(counterValue, ?)', [counterValue])});
}

/** The type alias and name of the resource that owns seeded translation rows. */
const SEED_TYPE_ALIAS = 'core.seed';
const SEED_NAME = 'core.seed';

/**
 * The seed actor — a `core.resource` row that owns everything a seed wrote.
 *
 * It has no `access.user` row and no credential, so it cannot log in; it exists
 * only so a production seed can tell its own rows from a user's edit, which is
 * what makes "the seed wins, but not over an edit" possible without a global
 * rule change (`D-626`, T-291). Minted lazily, so a database that never seeds
 * translations never grows it.
 */
async function seedActor(qb: KnexQb): Promise<string> {
    const find = async (): Promise<string | undefined> => {
        const row = await qb
            .select('core_resource.resourceId')
            .from('core_resource')
            .join('core_type', 'core_resource.typeId', 'core_type.typeId')
            .where('core_type.typeAlias', SEED_TYPE_ALIAS)
            .where('core_resource.resourceName', SEED_NAME)
            .first();
        return row ? bufToUuid(row.resourceId) : undefined;
    };
    const found = await find();
    if (found) return found;

    const typeId = await ensureType(qb, SEED_TYPE_ALIAS);
    const candidate = '478db89f-21da-45c8-8ef5-ada5402579bf';
    await qb('core_resource')
        .insert({resourceId: uuidBuf(candidate), resourceName: SEED_NAME, typeId})
        .onConflict()
        .ignore();
    // A concurrent start may have won the insert; the stored id is the actor.
    return (await find()) ?? candidate;
}

/**
 * Parse a translation seed block into pairs.
 *
 * The format is the one a person edits by hand: one pair per line, split on the
 * FIRST separator so a value may contain it, blank lines ignored, and an empty
 * value skipped — that is the collector's TODO marker, never a translation
 * (`D-631`). `keyParser` lets the resource seed split `typeAlias|name` without
 * taking the `|` out of the general rule.
 */
function parseSeedLines(
    content: string | undefined,
    keyParser?: (key: string) => {key: string; qualifier?: string} | undefined,
): Array<{key: string; value: string; qualifier?: string}> {
    const pairs: Array<{key: string; value: string; qualifier?: string}> = [];
    for (const raw of (content ?? '').split(/\r?\n/)) {
        const line = raw.trim();
        if (!line) continue;
        const at = line.indexOf('=');
        if (at < 0) continue;
        const rawKey = line.slice(0, at).trim();
        const value = line.slice(at + 1).trim();
        if (!rawKey || !value) continue;
        const parsed = keyParser ? keyParser(rawKey) : {key: rawKey};
        if (!parsed) continue;
        pairs.push({...parsed, value});
    }
    return pairs;
}

/**
 * Stamp a translation row with the authenticated editor.
 *
 * The id is the caller's `$meta.auth.actorId` — the access user's resource id —
 * so a hand correction stops being the seed's row to replace (`D-626`). A call
 * without an actor (a seed, a script) leaves `editorId` null, which the merge
 * reads as "nobody owns it yet". The hex string is converted by the generic
 * write path, so this returns the value the column expects on the wire.
 */
function editorStamp($meta: IMeta | undefined): {editorId?: string; editedAt: Date} {
    const actorId = $meta?.auth?.actorId;
    return {
        ...(typeof actorId === 'string' && actorId ? {editorId: actorId} : {}),
        editedAt: new Date(),
    };
}

/** The core.db helpers, as a handler sees them: `lib as unknown as CoreLib`. */
export type CoreLib = {
    uuidBuf: typeof uuidBuf;
    bufToUuid: typeof bufToUuid;
    newUuid: typeof newUuid;
    ensureType: typeof ensureType;
    nextCounter: typeof nextCounter;
    seedActor: typeof seedActor;
    parseSeedLines: typeof parseSeedLines;
    editorStamp: typeof editorStamp;
};

export default library(
    (): CoreLib => ({
        uuidBuf,
        bufToUuid,
        newUuid,
        ensureType,
        nextCounter,
        seedActor,
        parseSeedLines,
        editorStamp,
    }),
);
