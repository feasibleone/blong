/**
 * Variable masking (PRD R1).
 *
 * Order is significant: the ordered patterns must run most-specific first,
 * otherwise `<NUM>` would consume the digits inside a timestamp, a UUID, an IP
 * or a username and destroy the structure we are trying to preserve.
 */

const PATTERNS: ReadonlyArray<[RegExp, string]> = [
    // A home directory, in the spellings the three families write it:
    // /home/<user> (Linux, and every CI runner), /Users/<user> or /users/<user>
    // (macOS is case-insensitive) and C:\Users\<user> (Windows, drive letter
    // optional and either separator accepted). It runs before `<NUM>` so a
    // username that contains a digit is masked whole, and the lookbehind keeps
    // it to a home that opens a path: `proj/home/api` and `srv/users/data` are
    // ordinary directory names.
    [/(?<![\w.-])(?:[A-Za-z]:)?[\\/](?:Users|users|home)[\\/][A-Za-z0-9._-]+/g, '<HOME>'],
    // The root user's home carries no username segment to consume: in
    // /root/.blong the account directory is the one being masked, not a name
    // inside it.
    [/(?<![\w.-])[\\/]root(?=[\\/\s]|$)/g, '<HOME>'],
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

/**
 * Reduce free text to its structural form by replacing variable values.
 *
 * Total over whatever a caller passes: a logging call must never throw, and the
 * message reaches here from a call site that may have handed over an object
 * rather than text — a pino-shaped consumer such as fastify logs the request
 * itself. Anything without a text form is coerced, so an unexpected message
 * degrades to a readable record instead of aborting the call that logged it.
 */
export function mask(text: unknown): string {
    if (text === undefined || text === null) {
        return '';
    }
    let out = String(text);
    if (!out) {
        return '';
    }
    for (const [pattern, token] of PATTERNS) {
        out = out.replace(pattern, token);
    }
    return out.replace(/\s+/g, ' ').trim();
}
