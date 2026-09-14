/**
 * Hybrid serialization and hash-first identity (PRD R2, R3, R4).
 *
 * The identity input is a deterministic prefixed string rather than JSON: the
 * categorical fields sit in fixed positions so they are compared as structure,
 * while free text is masked (PRD R1) and contributes values-stripped content.
 */

import {createHash} from 'node:crypto';
import {mask} from './normalize.ts';
import type {LogRecord} from './record.ts';
import {REF_LENGTH} from './refs.ts';
import {compactStack} from './stack.ts';

/** Build the deterministic structural string a record's identity is derived from. */
export function serializeForIdentity(record: LogRecord): string {
    const parts = [
        `[LEVEL: ${String(record.levelName).toUpperCase()}]`,
        `[SERVICE: ${record.service}]`,
    ];
    if (record.context) {
        parts.push(`[CONTEXT: ${record.context}]`);
    }
    if (record.operation) {
        parts.push(`[OP: ${record.operation}]`);
    }
    parts.push(`[MSG: ${mask(record.msg)}]`);
    if (record.err) {
        if (record.err.type) {
            parts.push(`[ERR: ${record.err.type}]`);
        }
        if (record.err.message) {
            parts.push(`[ERR_MSG: ${mask(record.err.message)}]`);
        }
        if (record.err.stack) {
            parts.push(`[STACK: ${compactStack(record.err.stack)}]`);
        }
    }
    // A caller's `redact` pattern can replace the rationale itself
    // (`decision`, `**`) or just its candidate list (`decision.candidates`,
    // `decision.*`) with the `[redacted]` placeholder before identity is minted
    // — redaction runs first, see `logger.ts`. The slot is then no longer a
    // `Decision`, and identity minting must not throw on it: a configured
    // redaction pattern must never turn a log call into a crash. A collapsed
    // slot contributes nothing at all (the rationale is withheld, so no part of
    // it may shape the identity); a collapsed candidate list is omitted while
    // the discriminator and the chosen branch still contribute.
    const {decision} = record;
    if (decision && typeof decision === 'object') {
        parts.push(`[DECISION: ${decision.discriminator}=${decision.chosen}]`);
        if (Array.isArray(decision.candidates)) {
            parts.push(`[CANDIDATES: ${decision.candidates.join(',')}]`);
        }
    }
    return parts.join(' ');
}

/** Hash the structural form. Exact identity, no model involved (PRD R3). */
export function fingerprint(record: LogRecord): string {
    return hashTemplate(serializeForIdentity(record));
}

/** The one place the 32-hex identity is cut from the structural form. */
function hashTemplate(template: string): string {
    return createHash('sha256').update(template).digest('hex').slice(0, 32);
}

/**
 * Return a copy of the record with its identity fields filled in.
 *
 * `refs.template` is assigned here, from the fingerprint, rather than by the
 * logger: the template reference must be minted offline by the emitter, which
 * is what makes PRD R19 ("minted locally at emit time") and PRD R12 ("stable
 * across deploys") true without a round trip to the cluster service. The cut
 * length is the shared `REF_LENGTH`, so the reference emitted here and the key
 * the service registry files it under are the same cut by construction.
 */
export function withIdentity(record: LogRecord): LogRecord {
    const template = serializeForIdentity(record);
    const digest = hashTemplate(template);
    return {
        ...record,
        template,
        fingerprint: digest,
        refs: {...record.refs, template: digest.slice(0, REF_LENGTH)},
    };
}
