import crypto from 'node:crypto';

type KnexQb = any;

/**
 * Shared DB helpers for the core realm — UUID <-> BINARY(16) conversion and
 * `core_type`/`core_resource` graph utilities.  Imported directly by the
 * `core.db` handlers (plain module, not a handler itself).
 */

/** Convert a UUID string to a BINARY(16) Buffer for MySQL. */
export function uuidBuf(uuid: string): Buffer {
    return Buffer.from(uuid.replace(/-/g, ''), 'hex');
}

/** Read a BINARY(16) value from MySQL and return a hex (dashed) UUID string. */
export function bufToUuid(buf: Buffer | string): string {
    if (typeof buf === 'string') return buf;
    const hex = buf.toString('hex');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Generate a random UUID v4 string. */
export function newUuid(): string {
    return crypto.randomUUID();
}

/** Ensure a core_type row exists for the given alias, returning its integer typeId. */
export async function ensureType(qb: KnexQb, typeAlias: string): Promise<number> {
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
export async function nextCounter(
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
