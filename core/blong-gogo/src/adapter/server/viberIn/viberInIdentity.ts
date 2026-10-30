import type {IChatAccountMap} from '@feasibleone/blong/types';
import {handler, type IMeta} from '@feasibleone/blong/types';

import {chatAccountFind} from '../../../chatAccounts.ts';

/**
 * `viberIn.identity` — is this request Viber's, and which account is it for?
 *
 * The auth token keys the signature and doubles as the API credential, so one secret proves the
 * caller and authenticates the reply. `message_token` is the platform's id for the delivery and is
 * what a retry is matched against.
 */
interface IHookRequest {
    params?: {appId?: string; clientId?: string};
    headers: Record<string, string | string[] | undefined>;
    rawBody?: Buffer;
    body?: unknown;
}

const header = (value: string | string[] | undefined): string | undefined =>
    typeof value === 'string' ? value : Array.isArray(value) ? value[0] : undefined;

export default handler(({lib: {error, viberSignatureMatches}}) => {
    const errors = error({
        'viber.requestAccountMissing': {
            message: 'No Viber account is configured for app {appId} and client {clientId}',
            statusCode: 404,
        },
        'viber.signatureInvalid': {
            message: 'The Viber signature does not match the request body',
            statusCode: 401,
        },
    });

    return function viberInIdentity(request: IHookRequest, $meta: IMeta) {
        const port = this as unknown as {config?: {accounts?: IChatAccountMap}};
        const {appId, clientId} = request.params ?? {};
        const found = chatAccountFind(port.config?.accounts, appId, clientId);
        if (!found) throw errors['viber.requestAccountMissing']({params: {appId, clientId}}, $meta);
        if (
            !viberSignatureMatches({
                authToken: found.account.authToken,
                signature: header(request.headers['x-viber-content-signature']),
                rawBody: request.rawBody,
            })
        )
            throw errors['viber.signatureInvalid']({}, $meta);
        return {
            account: found.name,
            appId,
            clientId,
            requestId: (request.body as {message_token?: string | number} | undefined)
                ?.message_token,
        };
    };
});
