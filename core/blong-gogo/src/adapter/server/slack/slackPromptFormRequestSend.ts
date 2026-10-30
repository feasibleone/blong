import type {IChatAccountMap, IChatPrompt} from '@feasibleone/blong/types';
import {handler} from '@feasibleone/blong/types';

/**
 * `slack.prompt.form` — the modal a multiple choice or a free-text question is answered in.
 *
 * `trigger_id` is the part that cannot be invented: Slack lets a modal open only within three
 * seconds of an interaction, so the modal is opened from the click on the message's button. The realm
 * receives that click as `kind: 'prompt.form'` and calls this method with the trigger it carried.
 */
export interface ISlackFormParams {
    account?: string;
    conversationId: string;
    prompt: IChatPrompt;
    triggerId: string;
}

export default handler(({lib: {error, slackTokenGet, slackBaseGet, slackPromptView}}) => {
    const errors = error({
        'slack.accountMissing': {
            message: 'No Slack account {account} is configured',
            statusCode: 404,
        },
        'slack.triggerMissing': {
            message: 'Opening a Slack form needs the interaction trigger it was asked from',
            statusCode: 400,
        },
    });

    return function slackPromptFormRequestSend(
        this: {config?: {accounts?: IChatAccountMap; url?: string}},
        params: ISlackFormParams,
    ) {
        if (!params.triggerId) throw errors['slack.triggerMissing']({});
        const token = slackTokenGet(this.config?.accounts, params.account);
        if (!token) throw errors['slack.accountMissing']({params: {account: params.account ?? ''}});
        return {
            url: new URL(
                'views.open',
                slackBaseGet(this.config?.accounts, params.account, this.config?.url),
            ),
            path: 'views.open',
            method: 'POST',
            responseType: 'json',
            headers: {
                authorization: `Bearer ${token}`,
                'content-type': 'application/json; charset=utf-8',
            },
            json: {
                trigger_id: params.triggerId,
                view: slackPromptView(params.prompt, params.conversationId),
            },
        };
    };
});
