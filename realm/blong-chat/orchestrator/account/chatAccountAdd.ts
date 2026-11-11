import {randomUUID} from 'node:crypto';

import {handler, type IMeta} from '@feasibleone/blong';

/**
 * `chat.account.add` — a new account, with the identity the row needs.
 *
 * Two things the generic create cannot do for this table. The key: `accountId` is a `binary(16)` uuid
 * on a table that is not resource-backed, so the adapter generates it only when the caller sends the
 * `'uuid'` marker the schema declares as that column's default — which the page's form, built from the
 * cards, never sends. The timestamps: they are nullable so the gateway does not require them of every
 * caller, and this is the writer that fills them.
 *
 * Everything else — the columns, the constraints, the response — is the shared subject route's.
 */
export default handler(({lib: {dispatchedValue}}) => ({
    async chatAccountAdd(params: unknown, $meta: IMeta): Promise<unknown> {
        const port = this as unknown as {
            dispatch: (params: unknown, $meta: IMeta) => Promise<unknown>;
        };
        const call = params as {account?: Record<string, unknown>};
        const now = new Date().toISOString();
        const answer = await port.dispatch(
            {
                ...call,
                account: {
                    accountId: randomUUID(),
                    createdAt: now,
                    updatedAt: now,
                    ...call.account,
                },
            },
            {...$meta, method: 'db/chat.account.add', mtid: 'request'},
        );
        return dispatchedValue(answer);
    },
}));
