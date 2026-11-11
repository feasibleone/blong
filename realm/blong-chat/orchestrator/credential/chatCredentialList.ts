import type {IMeta} from '@feasibleone/blong';
import {handler} from '@feasibleone/blong';
import type {IChatAccountMap} from '@feasibleone/blong/types';

/**
 * `chat.credential.list` — the account map a platform port runs with.
 *
 * The query lives in `adapter/db`, where `queryBuilder` is in scope; this is the group the dispatch
 * port serves, so the port reaches an account through one namespace and not through the adapter's own
 * — a dispatch into an adapter folder from another realm resolves without running the handler
 * (`@@F-663`). An empty answer is deliberate: it is what tells the port to keep its configured
 * accounts, while a stored map replaces them rather than merging (`@@D-797`).
 */
export default handler(({handler: {'db/chatCredentialLoad': chatCredentialLoad}}) => ({
    async chatCredentialList(
        params: {platform?: string; includeDisabled?: boolean},
        $meta: IMeta,
    ): Promise<{accounts: IChatAccountMap}> {
        return (await chatCredentialLoad(params, $meta)) as {accounts: IChatAccountMap};
    },
}));
