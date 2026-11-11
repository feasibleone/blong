import {handler, type IMeta} from '@feasibleone/blong';

import {ACCOUNT_CREDENTIAL_FIELDS} from './chatAccountFind.ts';

/**
 * `chat.account.edit` — the form's save, with the mask it echoed back removed.
 *
 * The edit form is filled from `get`, so the secrets arrive with their real values; a person who
 * changes the alias and leaves the token alone then sends that token back unchanged, which is fine.
 * The case this handler exists for is the one where the form was filled from a *masked* value — a
 * client that read the list instead of the record — because writing eight dots over a working token is
 * the failure a masked field invites (`@@T-625`). The patch is what the caller meant; the query is the
 * shared subject route's.
 */
export default handler(({lib: {credentialPatchUnmasked, dispatchedValue}}) => ({
    async chatAccountEdit(params: unknown, $meta: IMeta): Promise<unknown> {
        const port = this as unknown as {
            dispatch: (params: unknown, $meta: IMeta) => Promise<unknown>;
        };
        const call = params as {account?: Record<string, unknown>};
        const account = credentialPatchUnmasked(
            call.account ?? {},
            ACCOUNT_CREDENTIAL_FIELDS,
        ) as Record<string, unknown>;
        const answer = await port.dispatch(
            {
                ...call,
                account: {...account, updatedAt: new Date().toISOString()},
            },
            {...$meta, method: 'db/chat.account.edit', mtid: 'request'},
        );
        return dispatchedValue(answer);
    },
}));
