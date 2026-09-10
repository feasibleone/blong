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
