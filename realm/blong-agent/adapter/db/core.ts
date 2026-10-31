import {library} from '@feasibleone/blong';

/**
 * `agent.db.core` — the conversions the persistence handlers share.
 *
 * Every id in this realm is a UUID stored as `BINARY(16)`, so a hand-written insert has to turn the
 * string into a buffer and a select has to turn it back (`[DB_ACCESS]`). Injected through `lib`, the
 * way `feedback` does it, because the two directions must agree and a second copy is how they stop.
 */
const uuidBuf = (uuid: string): Buffer => Buffer.from(uuid.replace(/-/g, ''), 'hex');

const bufToUuid = (value: Buffer | string): string => {
    if (typeof value === 'string') return value;
    const hex = value.toString('hex');
    return [
        hex.slice(0, 8),
        hex.slice(8, 12),
        hex.slice(12, 16),
        hex.slice(16, 20),
        hex.slice(20),
    ].join('-');
};

/** A row as it is written to a response: ids as strings, dates as ISO strings. */
const rowOut = (row: Record<string, unknown>): Record<string, unknown> => {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row)) {
        if (value instanceof Date) out[key] = value.toISOString();
        else if (Buffer.isBuffer(value) && key.endsWith('Id')) out[key] = bufToUuid(value);
        else if (Buffer.isBuffer(value)) out[key] = value.toString('utf8');
        else out[key] = value;
    }
    return out;
};

export default library(() => ({uuidBuf, bufToUuid, rowOut}));
