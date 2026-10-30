import type {IChatInbound} from '@feasibleone/blong/types';
import {handler, type IMeta} from '@feasibleone/blong/types';

import {chatPromptActionParse} from '../../../chatActions.ts';

/**
 * `viberIn.message` — what Viber sent, in the realm's one vocabulary.
 *
 * A Viber keyboard button answers with its text, so the button's payload *is* the message text: an
 * action id arriving as text is an answer, and anything else is something a person typed. Media
 * arrives as a URL on the message rather than as an upload.
 */
interface IHookRequest {
    params?: {appId?: string; clientId?: string};
    headers: Record<string, string | string[] | undefined>;
    rawBody?: Buffer;
    body?: unknown;
}

interface IViberIdentity {
    account?: string;
    appId?: string;
    clientId?: string;
}

const text = (value: unknown): string | undefined =>
    typeof value === 'string' ? value : undefined;

export default handler(() => {
    return function viberInMessage(request: IHookRequest, $meta: IMeta): IChatInbound | false {
        const identity = (($meta as unknown as {auth?: IViberIdentity}).auth ??
            {}) as IViberIdentity;
        const payload = request.body as Record<string, unknown> | undefined;
        if (!payload || payload.silent === true) return false;
        const event = text(payload.event);
        // `delivered`, `seen` and a webhook confirmation are acknowledgements, not conversation.
        if (event !== 'message' && event !== 'conversation_started') return false;
        const sender = (payload.sender ?? {}) as {id?: string; name?: string};
        const message = (payload.message ?? {}) as Record<string, unknown>;
        const body = text(message.text);
        const base = {
            platform: 'viber',
            account: identity.account,
            appId: identity.appId,
            clientId: identity.clientId,
            conversationId: sender.id ?? '',
            messageId:
                payload.message_token !== undefined ? String(payload.message_token) : undefined,
            timestamp: typeof payload.timestamp === 'number' ? payload.timestamp : undefined,
            sender: {id: sender.id, name: sender.name},
        };
        const answer = body ? chatPromptActionParse(body) : undefined;
        if (answer && !answer.form) {
            return {
                ...(base as unknown as IChatInbound),
                kind: 'answer',
                answer: {promptId: answer.promptId, value: answer.value},
            };
        }
        if (event === 'conversation_started') {
            return {...(base as unknown as IChatInbound), kind: 'event', type: 'text', text: body};
        }
        switch (message.type) {
            case 'text':
                return {
                    ...(base as unknown as IChatInbound),
                    kind: 'message',
                    type: 'text',
                    text: body,
                };
            case 'picture':
                return {
                    ...(base as unknown as IChatInbound),
                    kind: 'message',
                    type: 'image',
                    text: body,
                    attachments: [{url: text(message.media), filename: text(message.file_name)}],
                };
            case 'file':
            case 'video':
                return {
                    ...(base as unknown as IChatInbound),
                    kind: 'message',
                    type: 'image',
                    text: body,
                    attachments: [{url: text(message.media), filename: text(message.file_name)}],
                };
            case 'location': {
                const location = (message.location ?? {}) as {lat?: number; lon?: number};
                return {
                    ...(base as unknown as IChatInbound),
                    kind: 'message',
                    type: 'location',
                    attachments: [{details: {lat: location.lat, lon: location.lon}}],
                };
            }
            default:
                // A sticker, a contact card or a URL: nothing this bridge knows how to carry, but a
                // well-formed delivery, so it is acknowledged rather than refused.
                return false;
        }
    };
});
