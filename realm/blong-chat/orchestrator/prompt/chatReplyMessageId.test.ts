import {test} from 'tap';

import {chatReplyMessageId} from './chatReplyMessageId.ts';

/**
 * Which message an edit has to address.
 *
 * The reply is the platform's own body, so the only thing to get right is that the two names for the
 * one id are both read, and that a reply naming nothing answers nothing — that is the case a question
 * falls back to a separate message for (`@@D-692`).
 */

test('a reply names the message an edit has to address', t => {
    t.equal(
        chatReplyMessageId({ok: true, ts: '1700000000.000100'}),
        '1700000000.000100',
        'Slack answers a post with `ts`',
    );
    t.equal(
        chatReplyMessageId({status: 0, message_token: 1700000000000}),
        '1700000000000',
        'Viber answers with `message_token`, which comes as a number and is used as a string',
    );
    t.equal(chatReplyMessageId({ok: false}), undefined, 'a reply that names nothing answers nothing');
    t.equal(chatReplyMessageId(undefined), undefined, 'nor does no reply at all');
    t.end();
});
