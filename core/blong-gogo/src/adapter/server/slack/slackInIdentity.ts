import type {IChatAccountMap} from '@feasibleone/blong/types';
import {handler, type IMeta} from '@feasibleone/blong/types';

import {chatAccountFind} from '../../../chatAccounts.ts';

/**
 * `slackIn.identity` — is this request Slack's, and which account is it for?
 *
 * Runs before the payload is read: the signature is checked over the raw bytes, the account is
 * resolved from the two path parameters, and the platform's own event id is handed back so the
 * receiver can drop a retry without processing it twice (`@@D-676`).
 */
interface IHookRequest {
    params?: {appId?: string; clientId?: string; action?: string};
    headers: Record<string, string | string[] | undefined>;
    rawBody?: Buffer;
    body?: unknown;
}

const header = (value: string | string[] | undefined): string | undefined =>
    typeof value === 'string' ? value : Array.isArray(value) ? value[0] : undefined;

export default handler(({lib: {error, slackSignatureMatches}}) => {
    const errors = error({
        'slack.requestAccountMissing': {
            message: 'No Slack account is configured for app {appId} and client {clientId}',
            statusCode: 404,
        },
        'slack.signatureInvalid': {
            message: 'The Slack signature does not match the request body',
            statusCode: 401,
        },
    });

    return async function slackInIdentity(request: IHookRequest, $meta: IMeta) {
        const port = this as unknown as {
            config?: {accounts?: IChatAccountMap};
            log?: {warn?: (entry: unknown) => void};
        };
        const {appId, clientId} = request.params ?? {};
        const found = chatAccountFind(port.config?.accounts, appId, clientId);
        if (!found) {
            // Said before the throw, because the 404 reaches the platform and nothing else: an app
            // whose Request URL carries ids no account declares looks exactly like a message that was
            // never sent, and the two ids are the whole difference.
            port.log?.warn?.({
                account: Object.keys(port.config?.accounts ?? {}),
                appId,
                clientId,
                message:
                    'the request names an app and client no account declares; check the appId and ' +
                    'clientId of the account, and the Request URL the app points at',
            });
            throw errors['slack.requestAccountMissing']({params: {appId, clientId}}, $meta);
        }
        if (
            !slackSignatureMatches({
                secret: found.account.signingSecret,
                timestamp: header(request.headers['x-slack-request-timestamp']),
                signature: header(request.headers['x-slack-signature']),
                rawBody: request.rawBody,
            })
        )
            throw errors['slack.signatureInvalid']({}, $meta);
        return {
            account: found.name,
            appId,
            clientId,
            // `event_id` is Slack's id for a delivery; a retry carries the same one.
            requestId: (request.body as {event_id?: string} | undefined)?.event_id,
        };
    };
});
