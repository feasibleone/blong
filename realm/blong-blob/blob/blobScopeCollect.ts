import {BLOB_SCOPE_AUTHENTICATED} from '@feasibleone/blong/blob';

/**
 * Turn what the providers answered into the scope list a cookie carries.
 *
 * Each provider answers the tokens its own domain grants — `party:org:<id>`, `sport:club:<id>` — and
 * the realm adds `authenticated` for a caller that proved who it is. The list is deduplicated and
 * capped: a person in many organisations must not push a cookie past what a browser will keep, so the
 * least specific tokens are the ones a caller loses first (@@D-836).
 */
export const BLOB_SCOPE_LIMIT = 64;

export function blobScopeCollect(
    answers: readonly unknown[],
    actorId?: string,
    limit: number = BLOB_SCOPE_LIMIT,
): string[] {
    const scopes: string[] = [];
    const add = (value: unknown) => {
        if (typeof value !== 'string' || value.trim() === '') return;
        const token = value.trim();
        if (!scopes.includes(token)) scopes.push(token);
    };
    for (const answer of answers) {
        if (Array.isArray(answer)) {
            for (const token of answer) add(token);
            continue;
        }
        if (answer && typeof answer === 'object') {
            const list = (answer as {scopes?: unknown}).scopes;
            if (Array.isArray(list)) for (const token of list) add(token);
        }
    }
    if (actorId) add(BLOB_SCOPE_AUTHENTICATED);
    // The narrowest tokens are the ones a caller cares about; the cap drops from the front, which is
    // where the broadest ones sit because a provider answers its own first.
    return scopes.length > limit ? scopes.slice(scopes.length - limit) : scopes;
}
