import {handler, type IMeta} from '@feasibleone/blong';

/** The columns of an account that are secrets: the bot token, the signing secret, a Viber token. */
export const ACCOUNT_CREDENTIAL_FIELDS = ['botToken', 'signingSecret', 'authToken'] as const;

/**
 * `chat.account.find` — the account page's list, with its credentials replaced.
 *
 * The row is the credential, and the list is read by whoever may open the page: a working bot token in
 * a table is a token in a screenshot. What the page still needs is to *see* that something is
 * configured, so the column answers the mask rather than nothing, and the single record a form edits
 * keeps the real value (`@@T-625`). The query is the shared subject route's — this handler masks what
 * it answered and adds nothing else.
 */
export default handler(({lib: {credentialPageMasked, dispatchedValue}}) => ({
    async chatAccountFind(params: unknown, $meta: IMeta): Promise<unknown> {
        const port = this as unknown as {
            dispatch: (params: unknown, $meta: IMeta) => Promise<unknown>;
        };
        const answer = await port.dispatch(params, {
            ...$meta,
            method: 'db/chat.account.find',
            mtid: 'request',
        });
        return credentialPageMasked(dispatchedValue(answer), ACCOUNT_CREDENTIAL_FIELDS);
    },
}));
