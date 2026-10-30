import type {IChatAccountMap, IChatPromptParams} from '@feasibleone/blong/types';
import {handler, type IMeta} from '@feasibleone/blong/types';

import type {IViberKeyboard} from './keyboard.ts';

/**
 * `viber.prompt.send` — the question, with whatever Viber can render for it.
 *
 * A choice or a confirmation becomes keyboard buttons; a free-text question becomes the text a person
 * replies to. A multiple choice is refused: Viber has no checkbox, and answering it as a sequence of
 * single choices would be a different question from the one asked (`@@D-678`).
 */
export default handler(({lib: {error, viberTokenGet, viberBaseGet, viberPromptKeyboard}}) => {
    const errors = error({
        'viber.accountMissing': {
            message: 'No Viber account {account} is configured',
            statusCode: 404,
        },
        'viber.controlUnsupported': {
            message: 'Viber cannot render the {controlKind} control',
            statusCode: 400,
        },
    });

    return function viberPromptSendRequestSend(
        this: {config?: {accounts?: IChatAccountMap; url?: string}},
        params: IChatPromptParams,
        $meta: IMeta,
    ) {
        if (params.prompt.kind === 'multiChoice')
            throw errors['viber.controlUnsupported']({params: {controlKind: 'multiChoice'}}, $meta);
        const token = viberTokenGet(this.config?.accounts, params.account);
        if (!token) throw errors['viber.accountMissing']({params: {account: params.account ?? ''}});
        const keyboard = viberPromptKeyboard(params.prompt) as IViberKeyboard | undefined;
        return {
            url: new URL(
                'send_message',
                viberBaseGet(this.config?.accounts, params.account, this.config?.url),
            ),
            path: 'send_message',
            method: 'POST',
            responseType: 'json',
            headers: {
                'x-viber-auth-token': token,
                'content-type': 'application/json; charset=utf-8',
            },
            json: {
                receiver: params.conversationId,
                type: 'text',
                text: params.prompt.text,
                ...(keyboard && {keyboard}),
            },
        };
    };
});
