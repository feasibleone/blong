import {handler} from '@feasibleone/blong/types';

/**
 * `slackIn.server` — the HTTP answer for a payload that is not processed.
 *
 * Two cases reach here: the `url_verification` challenge, which must be echoed or the app can never
 * be installed, and anything the message hook disowned, which is acknowledged with the configured
 * body. A challenge is the only answer this hook shapes; everything else returns nothing and the
 * receiver's own response is used.
 */
interface IHookContext {
    request: {body?: unknown};
}

export default handler(() => {
    return function slackInServer(context: IHookContext) {
        const body = context.request.body as {challenge?: unknown} | undefined;
        if (body && typeof body.challenge === 'string') {
            return {code: 200, body: {challenge: body.challenge}};
        }
        return undefined;
    };
});
