import type {IChatAccountMap, IChatAttachment, IChatSendParams} from '@feasibleone/blong/types';
import {handler} from '@feasibleone/blong/types';

import {slackMarkdown, splitSlackText} from './markdown.ts';

/**
 * `slack.message.send` — the request `chat.postMessage` is made with.
 *
 * The token is read from the port's own configuration, which is the one place a secret lives: the
 * realm names an account and never sees what it authenticates with.
 */
/**
 * The sections one long answer becomes.
 *
 * A section holds 3000 characters and a message up to fifty of them, so the split is what lets a model
 * answer at length in one message rather than in a wall that Slack refuses (`@@D-730`).
 */
const sections = (text: string): unknown[] =>
    splitSlackText(text, 2_900).map(chunk => ({type: 'section', text: {type: 'mrkdwn', text: chunk}}));

const images = (attachments: IChatAttachment[] | undefined): unknown[] =>
    (attachments ?? [])
        .filter(
            attachment => attachment.url && /^image\//.test(attachment.contentType ?? 'image/*'),
        )
        .map(attachment => ({
            type: 'image',
            image_url: attachment.url,
            alt_text: attachment.title ?? attachment.filename ?? 'image',
        }));

export default handler(({lib: {error, slackTokenGet, slackBaseGet}}) => {
    const errors = error({
        'slack.accountMissing': {
            message: 'No Slack account {account} is configured',
            statusCode: 404,
        },
    });

    return function slackMessageSendRequestSend(
        this: {config?: {accounts?: IChatAccountMap; url?: string}},
        params: IChatSendParams,
    ) {
        const token = slackTokenGet(this.config?.accounts, params.account);
        if (!token) throw errors['slack.accountMissing']({params: {account: params.account ?? ''}});
        // A model answers in Markdown and Slack reads mrkdwn, so the text is translated before it is
        // sent; a short answer travels as the message's own text, which is what the notification shows.
        const markdown = slackMarkdown(params.text ?? '');
        const long = markdown.length > 2_900;
        const blocks = [...(long ? sections(markdown) : []), ...images(params.attachments)];
        return {
            // The account's own base, so a test account's call reaches the simulator rather than the
            // real API while the same process serves both (`@@D-687`).
            url: new URL(
                'chat.postMessage',
                slackBaseGet(this.config?.accounts, params.account, this.config?.url),
            ),
            path: 'chat.postMessage',
            method: 'POST',
            responseType: 'json',
            headers: {
                authorization: `Bearer ${token}`,
                'content-type': 'application/json; charset=utf-8',
            },
            json: {
                channel: params.conversationId,
                mrkdwn: true,
                // Slack asks for a text fallback beside blocks, for the notification and for search.
                text: markdown,
                ...(blocks.length && {blocks}),
            },
        };
    };
});
