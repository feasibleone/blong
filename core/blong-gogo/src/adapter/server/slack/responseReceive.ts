import {handler} from '@feasibleone/blong/types';

/**
 * `response.receive` — the answer every Slack call in this group shares.
 *
 * The Web API answers HTTP 200 with `{ok: false, error}` for a refusal, so a status check alone would
 * read a failure as success. The commonest refusals are named here because they are the ones a
 * deployment meets: a token without the scope, and a channel the app was never added to.
 */
interface ISlackAnswer {
    statusCode?: number;
    body?: {ok?: boolean; error?: string; [key: string]: unknown};
}

const reasons: Record<string, string> = {
    not_authed: 'the token is missing or was revoked',
    invalid_auth: 'the token is not valid',
    account_inactive: 'the bot account is inactive',
    missing_scope: 'the token does not carry the scope this call needs',
    channel_not_found: 'the conversation is not one the app can see',
    not_in_channel: 'the app is not a member of the conversation',
};

export default handler(({lib: {error}}) => {
    const errors = error({
        'slack.refused': {
            message: 'Slack refused the call: {reason}',
            statusCode: 502,
        },
    });

    return function responseReceive(response: ISlackAnswer) {
        const body = response?.body ?? {};
        if (body.ok === false) {
            const code = body.error ?? 'unknown';
            throw errors['slack.refused']({params: {reason: reasons[code] ?? code}});
        }
        return body;
    };
});
