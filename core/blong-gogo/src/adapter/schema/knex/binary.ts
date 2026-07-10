/**
 * Binary column utilities for the knex adapter.
 *
 * Handles conversion between binary(16) columns (used for UUIDs, ULIDs etc.)
 * and their string representations.  On startup the adapter discovers binary(16)
 * columns from INFORMATION_SCHEMA, then uses this module to:
 *
 *  - Convert SELECT result Buffers → base64 strings
 *  - Convert WHERE / INSERT / UPDATE string values → Buffer
 *
 * Input string → Buffer conversion supports multiple encodings:
 *  - **hex** — 32-character hex string
 *  - **uuid** — 36-character UUID with dashes
 *  - **base64** — 24-character base64 string
 *  - **crockford-base32** — 26-character Crockford base32 string
 */
import {type Knex} from '@feasibleone/blong';

// ── Crockford base32 alphabet ────────────────────────────────────────────────

// cSpell:disable-next-line
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const CROCKFORD_REV: Record<string, number> = {};
for (let i = 0; i < CROCKFORD.length; i++) CROCKFORD_REV[CROCKFORD[i]] = i;

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Discover binary(16) columns from INFORMATION_SCHEMA.
 *
 * Call this once during adapter `ready()`, after the schema has been synced,
 * and store the result on `this.config.context.binaryColumns`.
 */
export async function discoverBinaryColumns(knex: Knex): Promise<Map<string, Set<string>>> {
    const rows: Array<{TABLE_NAME: string; COLUMN_NAME: string}> = await knex
        .from('INFORMATION_SCHEMA.COLUMNS')
        .where({
            DATA_TYPE: 'binary',
            CHARACTER_MAXIMUM_LENGTH: 16,
        })
        .select('TABLE_NAME', 'COLUMN_NAME');
    const map = new Map<string, Set<string>>();
    for (const row of rows) {
        const table = row.TABLE_NAME;
        if (!map.has(table)) map.set(table, new Set());
        map.get(table)!.add(row.COLUMN_NAME);
    }
    return map;
}

/**
 * Check whether `column` in `table` is a known binary(16) column.
 */
export function isBinaryColumn(
    binaryMap: Map<string, Set<string>> | undefined,
    table: string,
    column: string,
): boolean {
    return binaryMap?.get(table)?.has(column) ?? false;
}

/**
 * Convert a single Buffer from a binary(16) column to a base64 string.
 */
export function binaryToStr(buf: Buffer): string {
    return buf.toString('base64');
}

/**
 * Parse a string value into a Buffer for a binary(16) column.
 *
 * Tries the following encodings in order (first match wins):
 *  1. **hex** — exactly 32 hex characters
 *  2. **uuid** — 36 characters with 4 dashes (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)
 *  3. **base64** — 24 characters (with or without trailing ==)
 *  4. **crockford-base32** — exactly 26 characters from the Crockford alphabet
 */
export function strToBinary(val: string): Buffer {
    // 1. hex (32 hex chars = 16 bytes)
    if (/^[0-9a-fA-F]{32}$/.test(val)) {
        return Buffer.from(val, 'hex');
    }
    // 2. UUID (36 chars with dashes)
    if (/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(val)) {
        return Buffer.from(val.replace(/-/g, ''), 'hex');
    }
    // 3. base64 (typically 24 chars, possibly with trailing ==)
    if (/^[A-Za-z0-9+/]{22}(={2})?$/.test(val) || /^[A-Za-z0-9+/]{24}$/.test(val)) {
        return Buffer.from(val, 'base64');
    }
    // 4. Crockford base32 (26 chars)
    if (val.length === 26) {
        const upper = val.toUpperCase();
        if ([...upper].every(c => CROCKFORD.includes(c))) {
            return crockfordDecode(upper);
        }
    }
    throw new Error(`Cannot parse value as binary(16): "${val}"`);
}

/**
 * Convert a raw query result row by replacing any Buffer values with their
 * base64 string representation.  Operates in-place and returns the same row.
 */
export function prepareResultRow(
    row: Record<string, unknown> | undefined,
    binaryMap: Map<string, Set<string>> | undefined,
    table: string,
): Record<string, unknown> | undefined {
    if (!row || !binaryMap) return row;
    const binaryCols = binaryMap.get(table);
    if (!binaryCols) return row;
    for (const col of binaryCols) {
        const val = row[col];
        if (Buffer.isBuffer(val)) {
            row[col] = binaryToStr(val);
        }
    }
    return row;
}

/**
 * Convert a raw query result array by replacing Buffer values with base64
 * strings.  Operates in-place and returns the same array.
 */
export function prepareResultRows(
    rows: Record<string, unknown>[],
    binaryMap: Map<string, Set<string>> | undefined,
    table: string,
): Record<string, unknown>[] {
    if (!binaryMap) return rows;
    const binaryCols = binaryMap.get(table);
    if (!binaryCols) return rows;
    for (const row of rows) {
        for (const col of binaryCols) {
            const val = row[col];
            if (Buffer.isBuffer(val)) {
                row[col] = binaryToStr(val);
            }
        }
    }
    return rows;
}

/**
 * Given a params object that will be used in a WHERE / INSERT / UPDATE clause,
 * convert any string values that correspond to binary(16) columns into Buffer.
 *
 * Returns a new object (does not mutate the input).
 */
export function prepareInputParams(
    params: Record<string, unknown>,
    binaryMap: Map<string, Set<string>> | undefined,
    table: string,
): Record<string, unknown> {
    if (!binaryMap) return params;
    const binaryCols = binaryMap.get(table);
    if (!binaryCols) return params;
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(params)) {
        if (binaryCols.has(key) && typeof val === 'string') {
            result[key] = strToBinary(val);
        } else {
            result[key] = val;
        }
    }
    return result;
}

// ── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Decode a 26-character Crockford base32 string into a 16-byte Buffer.
 *
 * Crockford base32 encodes 5 bits per character → 130 bits → 16 bytes + 2 spare bits.
 * The extra bits are ignored (per spec, implementations should check they are zero).
 */
function crockfordDecode(val: string): Buffer {
    const bytes = Buffer.allocUnsafe(16);
    let bits = 0;
    let bitCount = 0;
    let byteIdx = 0;
    for (const ch of val) {
        const value = CROCKFORD_REV[ch];
        bits = (bits << 5) | value;
        bitCount += 5;
        if (bitCount >= 8) {
            bitCount -= 8;
            bytes[byteIdx++] = (bits >> bitCount) & 0xff;
            bits &= (1 << bitCount) - 1;
        }
    }
    return bytes;
}
