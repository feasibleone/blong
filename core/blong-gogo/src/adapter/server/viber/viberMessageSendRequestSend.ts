import type {IChatAccountMap, IChatAttachment, IChatSendParams} from '@feasibleone/blong/types';
import {handler} from '@feasibleone/blong/types';

/**
 * `viber.message.send` — the request `send_message` is made with.
 *
 * A text message, a picture or a location, because those are the three the realm produces; anything
 * else a platform can carry stays in the platform until something needs it.
 */
const first = (attachments: IChatAttachment[] | undefined, type: string) =>
    (attachments ?? []).find(attachment => attachment.contentType?.startsWith(type));

export default handler(({lib: {error, viberTokenGet, viberBaseGet}}) => {
    const errors = error({
        'viber.accountMissing': {
            message: 'No Viber account {account} is configured',
            statusCode: 404,
        },
    });

    return function viberMessageSendRequestSend(
        this: {config?: {accounts?: IChatAccountMap; url?: string}},
        params: IChatSendParams,
    ) {
        const token = viberTokenGet(this.config?.accounts, params.account);
        if (!token) throw errors['viber.accountMissing']({params: {account: params.account ?? ''}});
        const picture = first(params.attachments, 'image/');
        const location = params.attachments?.find(attachment => attachment.details);
        const body = picture
            ? {
                  type: 'picture',
                  text: params.text,
                  media: picture.url,
                  ...(picture.thumbnail && {thumbnail: picture.thumbnail}),
              }
            : location
              ? {
                    type: 'location',
                    location: {lat: location.details?.lat, lon: location.details?.lon},
                }
              : {type: 'text', text: params.text};
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
            json: {receiver: params.conversationId, ...body},
        };
    };
});
