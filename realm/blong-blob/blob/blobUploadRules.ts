import type {IBlobMeta} from '@feasibleone/blong';

/** Why a commit cannot proceed, or `null` when it can. */
export type BlobUploadRefusal = 'expired' | 'incomplete' | null;

/**
 * Whether a record may be committed, and if not, why.
 *
 * The rule is the record's own: an `expiresAt` in the past means the browser abandoned the form, and a
 * pending record with no size means the bytes never arrived. Both are refusals rather than silent
 * successes, because a commit that promoted an empty file would answer a reference to nothing.
 */
export function blobUploadRefusal(
    meta: Pick<IBlobMeta, 'state' | 'size' | 'expiresAt'>,
    now: number = Date.now(),
): BlobUploadRefusal {
    if (meta.expiresAt) {
        const expiresAt = Date.parse(meta.expiresAt);
        if (!Number.isNaN(expiresAt) && expiresAt <= now) return 'expired';
    }
    if (meta.state === 'pending' && meta.size <= 0) return 'incomplete';
    return null;
}

/** Whether a record is past its lifetime, for the cleanup sweep. */
export function blobExpired(
    meta: Pick<IBlobMeta, 'expiresAt'>,
    now: number = Date.now(),
): boolean {
    if (!meta.expiresAt) return false;
    const expiresAt = Date.parse(meta.expiresAt);
    return !Number.isNaN(expiresAt) && expiresAt <= now;
}
