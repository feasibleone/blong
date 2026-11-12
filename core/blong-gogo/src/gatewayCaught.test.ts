import {test} from 'tap';

import {caughtError} from './gatewayCaught.ts';

test('a failed dispatch is unwrapped to the error it carries', t => {
    const typed = Object.assign(new Error('A question cannot wait'), {
        type: 'chat.promptTimeoutTooLong',
        statusCode: 400,
    });
    // What one dispatch path actually rethrows: the packet, with the error at index 0.
    const packet = Object.assign([typed, {method: 'chat.prompt.ask'}], {
        method: 'chat.prompt.ask',
    });
    t.equal(caughtError(packet), typed, 'the packet answers with its error, not with an array');
    t.equal(
        (caughtError(packet) as {statusCode?: number}).statusCode,
        400,
        'so the status the error declared survives to the reply',
    );
    t.equal(
        (caughtError(packet) as {type?: string}).type,
        'chat.promptTimeoutTooLong',
        'and so does its type, which is what the reply is formatted from',
    );

    t.equal(caughtError(typed), typed, 'an error thrown on its own is passed through');
    t.equal(caughtError('boom'), 'boom', 'and so is anything that is not a packet');
    t.equal(caughtError(undefined), undefined, 'an empty rejection stays empty');
    t.same(caughtError([]), [], 'an empty array has no first element, so it is left alone');
    t.end();
});
