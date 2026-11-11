import {library} from '@feasibleone/blong';

/**
 * What a credential reads as in a list, and what a caller writing one back may leave in place.
 *
 * A table of accounts is a table of secrets: the value has to be *there* for a person to see that
 * something is configured and to replace it, but the list is read by whoever may open the page, and a
 * live configuration token in a table is a token in a screenshot. The list replaces it, the single
 * record still answers the real value — the one page that needs it is the edit form — and a write that
 * carries this back unchanged leaves the stored secret alone rather than overwriting it with dots
 * (`@@T-625`).
 */
export const CREDENTIAL_MASK = '••••••••';

/**
 * `credentialMask` — what a credential reads as in a list, and what a write may leave alone.
 *
 * Three operations rather than three call sites: a page of rows, one row, and the patch a form sends
 * back. The password half of the problem — showing dots — is the model's `widget`; this is the half a
 * model cannot do, because the value has left the process before any widget sees it (`@@T-625`).
 *
 * A null or absent field stays as it is. A column that holds nothing is not a secret, and replacing an
 * empty value with dots would say one is configured when it is not.
 */
export type CredentialFields = readonly string[];

const isMasked = (value: unknown): boolean => value === CREDENTIAL_MASK;

/** One row, with every named credential replaced by the mask it is shown as. */
export const credentialRowMasked = (
    row: Record<string, unknown>,
    fields: CredentialFields,
): Record<string, unknown> => {
    const masked = {...row};
    for (const field of fields) {
        const value = masked[field];
        if (value !== undefined && value !== null && value !== '') masked[field] = CREDENTIAL_MASK;
    }
    return masked;
};

/**
 * Whatever a `find` answered, with the named credentials masked.
 *
 * Both shapes the generic route answers with are read: a bare page, and the page under `items` with its
 * total beside it. A result that is neither is returned untouched rather than guessed at, because a
 * list this function cannot see is one it cannot mask either.
 */
export const credentialPageMasked = (
    answer: unknown,
    fields: CredentialFields,
): unknown => {
    const mask = (rows: unknown): unknown =>
        Array.isArray(rows)
            ? rows.map(row =>
                  row && typeof row === 'object'
                      ? credentialRowMasked(row as Record<string, unknown>, fields)
                      : row,
              )
            : rows;
    if (Array.isArray(answer)) return mask(answer);
    if (!answer || typeof answer !== 'object') return answer;
    const page = answer as {items?: unknown};
    if (!Array.isArray(page.items)) return answer;
    return {...(answer as Record<string, unknown>), items: mask(page.items)};
};

/**
 * The patch a form sent, without the places it only echoed the mask back.
 *
 * A field the person did not retype arrives as the mask, and writing that to the column would replace a
 * working credential with eight dots — the failure that makes a masked form dangerous (`@@T-625`). What
 * is left is the patch the caller actually meant.
 */
export const credentialPatchUnmasked = (
    patch: Record<string, unknown>,
    fields: CredentialFields,
): Record<string, unknown> => {
    const kept: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(patch)) {
        if (fields.includes(key) && isMasked(value)) continue;
        kept[key] = value;
    }
    return kept;
};

/**
 * The value inside what a port dispatch answered.
 *
 * A dispatch answers the callee's value with the flow trailer beside it — `[value, meta]` — which is
 * the shape `chatAccountsFromDispatch` reads for the platform ports. A handler that answers a caller
 * has to hand on the value alone, and the value may itself be an array (a bare page of rows), so the
 * trailer decides which of the two this is.
 */
export const dispatchedValue = (answer: unknown): unknown => {
    if (!Array.isArray(answer) || answer.length < 2) return answer;
    const trailer = answer[1];
    const looksLikeTrailer =
        Boolean(trailer) &&
        typeof trailer === 'object' &&
        ('forward' in (trailer as object) || 'opcode' in (trailer as object));
    return looksLikeTrailer ? answer[0] : answer;
};

export default library(() => ({
    credentialRowMasked,
    credentialPageMasked,
    credentialPatchUnmasked,
    dispatchedValue,
}));
