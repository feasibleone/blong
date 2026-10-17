import crypto from 'node:crypto';

import {library} from '@feasibleone/blong';

/** Convert a UUID string to a BINARY(16) Buffer for MySQL. */
function uuidBuf(uuid: string): Buffer {
    return Buffer.from(uuid.replace(/-/g, ''), 'hex');
}

/** Read a BINARY(16) value from MySQL and return a hex string. */
function bufToUuid(buf: Buffer | string): string {
    if (typeof buf === 'string') return buf;
    const hex = buf.toString('hex');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Generate a random UUID v4 string. */
function newUuid(): string {
    return crypto.randomUUID();
}

/** Split a comma-separated string of names, trimming whitespace and filtering empty entries. */
function splitNames(value: string): string[] {
    return value
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);
}

/**
 * Shared account helpers for the `access.db` group — UUID conversion and
 * role-name splitting.
 *
 * Injected library functions: every handler of the group receives them from
 * `lib` and takes the type from here, so the call sites stay typed even though
 * the runtime members are `LibFn`s:
 *
 *     handler(({lib}) => {
 *         const account = lib as unknown as AccountLib;
 *         …
 *     });
 *
 * Password hashing lives in `password.ts` (a config-driven library of the same
 * group), and the ACL/UI model helpers in `accessModel.ts`.
 */
export type AccountLib = {
    uuidBuf: typeof uuidBuf;
    bufToUuid: typeof bufToUuid;
    newUuid: typeof newUuid;
    splitNames: typeof splitNames;
};

export default library((): AccountLib => ({uuidBuf, bufToUuid, newUuid, splitNames}));
