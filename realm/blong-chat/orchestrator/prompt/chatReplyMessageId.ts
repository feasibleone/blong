import {library} from '@feasibleone/blong';

/**
 * `chat.message.id` — the id a send reply named, in whichever word the platform uses for it.
 *
 * A reply is the platform's own body and the two platforms disagree about the name: Slack answers a
 * post with `ts`, Viber with `message_token`. An edit addresses the message by that id, so the
 * difference is read once here rather than in every caller (`@@D-692`). A platform that names nothing
 * answers nothing, which is what the ask falls back to a fresh message for.
 */
export const chatReplyMessageId = (reply: unknown): string | undefined => {
    const body = reply as {ts?: unknown; message_token?: unknown} | undefined;
    if (typeof body?.ts === 'string') return body.ts;
    if (typeof body?.message_token === 'number' || typeof body?.message_token === 'string')
        return String(body.message_token);
    return undefined;
};

export default library(() => ({chatReplyMessageId}));
