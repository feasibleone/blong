import crypto from 'node:crypto';

import {library} from '@feasibleone/blong';

/**
 * Shared helpers for the `gateway.db` group — UUID <-> BINARY(16) conversion and
 * name splitting.
 *
 * Injected library functions: every handler of the group receives them from
 * `lib` and takes the type from here, so the call sites stay typed:
 *
 *     const gateway = lib as unknown as GatewayUuidLib;
 *     gateway.uuidBuf(applicationId);
 *
 * The `dbTest` group (test seeds) has its own copy of the one conversion it
 * needs, because a library belongs to the group that holds it.
 */

/** Convert a UUID string to a BINARY(16) Buffer for MySQL. */
function uuidBuf(uuid: string): Buffer {
    return Buffer.from(uuid.replace(/-/g, ''), 'hex');
}

/** Read a BINARY(16) value from MySQL and return a hex UUID string. */
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

/** The gateway.db helpers, as a handler sees them: `lib as unknown as GatewayUuidLib`. */
export type GatewayUuidLib = {
    uuidBuf: typeof uuidBuf;
    bufToUuid: typeof bufToUuid;
    newUuid: typeof newUuid;
    splitNames: typeof splitNames;
};

export default library((): GatewayUuidLib => ({uuidBuf, bufToUuid, newUuid, splitNames}));
