import type {IAssert, IMeta} from '@feasibleone/blong';
import {handler} from '@feasibleone/blong';

import {forwardedMessages, resetForwarded} from '../../../testRecord.ts';
import {SLACK_OTHER_URL, slackPost, waitFor} from '../../../testSupport.ts';

/**
 * The inbound half, as a platform experiences it.
 *
 * Every step posts a signed body to the listener the realm opened — the parser, the signature check,
 * the account lookup and the mapping all run as they would for Slack — and then reads what the realm
 * forwarded to `test.chat.received`. That is the seam a consumer uses, so the test asserts on the
 * same contract rather than on an internal record (`@@T-518`).
 */
const event = (id: string, text: string): string =>
    JSON.stringify({
        type: 'event_callback',
        event_id: id,
        event: {
            type: 'message',
            client_msg_id: id,
            ts: '1700000000.000100',
            channel: 'D1',
            user: 'U1',
            text,
        },
    });

export default handler(context => {
    const {group} = context.lib;
    const {chatInMessageIgnore, chatInAnswerReceive} = context.handler;
    return {
        testChatInbound: ({name = 'chat inbound'}: {name?: string} = {}) =>
            group(name)([
                async function aSignedEventReachesTheRealm(assert: IAssert) {
                    resetForwarded();
                    const answer = await slackPost(event('Ev1', 'hello from slack'));
                    assert.equal(answer.status, 200, 'a signed delivery is acknowledged');
                    const recorded = await waitFor(() =>
                        forwardedMessages().find(message => message.messageId === 'Ev1'),
                    );
                    assert.equal(recorded.text, 'hello from slack', 'and the realm sees the text');
                    assert.equal(recorded.conversationId, 'D1', 'in the conversation it came from');
                    assert.equal(
                        recorded.account,
                        'demo',
                        'attributed to the account the path named',
                    );
                },

                async function aRetryIsAcknowledgedButDeliveredOnce(assert: IAssert) {
                    resetForwarded();
                    const body = event('Ev2', 'only once');
                    await slackPost(body);
                    await slackPost(body);
                    await waitFor(() => forwardedMessages().length > 0);
                    // A second delivery would have been forwarded by now: the first one took no
                    // longer.
                    await new Promise(resolve => setTimeout(resolve, 200));
                    assert.equal(
                        forwardedMessages().filter(message => message.messageId === 'Ev2').length,
                        1,
                        'the platform retry is acknowledged and not processed twice',
                    );
                },

                async function aForgedRequestIsRefusedBeforeAnythingRuns(assert: IAssert) {
                    resetForwarded();
                    const raw = event('Ev3', 'forged');
                    const answer = await slackPost(raw, 'application/json', {
                        'content-type': 'application/json',
                        'x-slack-signature': 'v0=deadbeef',
                        'x-slack-request-timestamp': String(Math.floor(Date.now() / 1000)),
                    });
                    assert.equal(answer.status, 401, 'the receiver answers 401');
                    assert.match(answer.text, /signature/, 'and names the check that failed');
                    assert.equal(forwardedMessages().length, 0, 'while nothing reached the realm');
                },

                async function aChallengeIsAnsweredFromTheServerHook(assert: IAssert) {
                    const answer = await slackPost(
                        JSON.stringify({type: 'url_verification', challenge: 'abc123'}),
                    );
                    assert.equal(answer.status, 200, 'the challenge is answered');
                    assert.deepEqual(
                        JSON.parse(answer.text),
                        {challenge: 'abc123'},
                        'with the challenge Slack sent, or the app can never be installed',
                    );
                },

                async function aMessageWithNoTextIsStillForwarded(assert: IAssert) {
                    resetForwarded();
                    const answer = await slackPost(
                        JSON.stringify({
                            type: 'event_callback',
                            event_id: 'Ev4',
                            event: {
                                type: 'message',
                                client_msg_id: 'Ev4',
                                ts: '1700000000.000200',
                                channel: 'D1',
                                user: 'U1',
                                files: [
                                    {url_private: 'https://files/x.png', mimetype: 'image/png'},
                                ],
                            },
                        }),
                    );
                    assert.equal(answer.status, 200, 'a picture is acknowledged like a message');
                    const recorded = await waitFor(() =>
                        forwardedMessages().find(message => message.messageId === 'Ev4'),
                    );
                    assert.equal(recorded.type, 'image', 'and arrives as one');
                    assert.equal(
                        recorded.text,
                        undefined,
                        'with no text to answer a question with',
                    );
                },

                async function anAccountNobodyMappedIsAcknowledgedAndDropped(assert: IAssert) {
                    resetForwarded();
                    // The same listener serves both accounts; `forward` maps only the first, so this
                    // one falls to the `*` entry and its message is dropped with a log line.
                    const answer = await slackPost(
                        event('Ev6', 'for the other workspace'),
                        'application/json',
                        undefined,
                        SLACK_OTHER_URL,
                    );
                    assert.equal(answer.status, 200, 'the delivery is acknowledged all the same');
                    await new Promise(resolve => setTimeout(resolve, 200));
                    assert.equal(
                        forwardedMessages().filter(message => message.messageId === 'Ev6').length,
                        0,
                        'and no consumer of the mapped account sees it',
                    );
                },

                async function aDeploymentWithNoConsumerDropsTheMessage(
                    assert: IAssert,
                    {$meta}: {$meta: IMeta},
                ) {
                    const result = await chatInMessageIgnore(
                        {
                            kind: 'message',
                            platform: 'slack',
                            account: 'demo',
                            conversationId: 'D5',
                            messageId: 'Ev5',
                            text: 'anybody there?',
                        },
                        $meta,
                    );
                    assert.deepEqual(
                        result,
                        {handled: true},
                        'a message nobody consumes is acknowledged and logged, not refused',
                    );
                },

                async function anAnswerInTheFlatShapeIsAccepted(
                    assert: IAssert,
                    {$meta}: {$meta: IMeta},
                ) {
                    // The gateway route sends what a caller has — the fields, not an inbound — and a
                    // prompt that is no longer waiting is acknowledged rather than failing a caller
                    // that cannot do anything about it (`@@D-678`).
                    const result = await chatInAnswerReceive(
                        {
                            platform: 'slack',
                            // No account: a caller that reaches the gateway names the platform and
                            // the conversation, and the key has to hold that too.
                            conversationId: 'D6',
                            promptId: '00000000-0000-4000-8000-000000000000',
                            value: 'a',
                        },
                        $meta,
                    );
                    assert.deepEqual(
                        result,
                        {handled: true},
                        'a late answer settles nothing and fails nobody',
                    );
                },

                async function aWaitGivesUpInsteadOfHanging(assert: IAssert) {
                    await assert.rejects(
                        async () => waitFor(() => undefined, 25),
                        /timed out waiting/,
                        'the helper fails rather than holding the run forever',
                    );
                },
            ]),
    };
});
