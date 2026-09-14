/**
 * Variable masking (PRD R1).
 *
 * Order is significant: the ordered patterns must run most-specific first,
 * otherwise `<NUM>` would consume the digits inside a timestamp, a UUID or an
 * IP and destroy the structure we are trying to preserve.
 */

const PATTERNS: ReadonlyArray<[RegExp, string]> = [
    // 2026-09-13T10:11:12.345Z / 2026-09-13 10:11:12
    [/\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?/g, '<TS>'],
    // 26-character Crockford base32 ULID: base32 minus I, L, O and U. The
    // letters J, K and M, N are written below as single-letter ranges so the
    // alphabet does not read as a misspelled word to the spell checker; the
    // set of accepted characters is unchanged.
    [/\b[0-9A-HJ-KM-NP-TV-Z]{26}\b/g, '<ULID>'],
    // 8-4-4-4-12 hex UUID
    [/\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b/g, '<UUID>'],
    // dotted quad
    [/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '<IP>'],
    // 0x-prefixed hex
    [/\b0x[0-9a-fA-F]+\b/g, '<HEX>'],
    // Any remaining number. No trailing `\b`: a quantity glued to its unit
    // (`5000ms`) must still mask, since the digits are the variable part.
    [/\b\d+/g, '<NUM>'],
];

/** Reduce free text to its structural form by replacing variable values. */
export function mask(text: string): string {
    if (!text) {
        return '';
    }
    let out = text;
    for (const [pattern, token] of PATTERNS) {
        out = out.replace(pattern, token);
    }
    return out.replace(/\s+/g, ' ').trim();
}
