import crypto from 'node:crypto';

/** Convert a UUID string to a BINARY(16) Buffer for MySQL. */
export function uuidBuf(uuid: string): Buffer {
    return Buffer.from(uuid.replace(/-/g, ''), 'hex');
}

/** Read a BINARY(16) value from MySQL and return a hex string. */
export function bufToUuid(buf: Buffer | string): string {
    if (typeof buf === 'string') return buf;
    const hex = buf.toString('hex');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Generate a random UUID v4 string. */
export function newUuid(): string {
    return crypto.randomUUID();
}

/** Split a comma-separated string of names, trimming whitespace and filtering empty entries. */
export function splitNames(value: string): string[] {
    return value
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);
}

/**
 * Shared account/credential helpers for the access realm — UUID conversion and
 * role-name splitting.  Imported directly by the `access.db` handlers (plain
 * module, not a handler itself).  Password hashing lives in `password.ts`
 * (config-driven library).
 */
