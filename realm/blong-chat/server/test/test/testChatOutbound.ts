import type {IAssert, IMeta} from '@feasibleone/blong';
import {handler} from '@feasibleone/blong';

import {simRequests, simReset} from '../../../simRecord.ts';
import {TEST_PORTS} from '../../../testPorts.ts';
import {slackPost, viberPost, waitFor} from '../../../testSupport.ts';

/**
 * The outbound half, against the simulator the platform API would be.
 *
 * The port builds the call it would make and the sim receives it, so what is asserted is the
 * descriptor — the endpoint, the conversation and the text — rather than a stub's opinion of it
 * (`@@D-681`). The question steps go further: the ask is started, the prompt the realm posted is read
 * back from the sim, and the answer is delivered the way Slack delivers one, as a signed interaction.
 */
interface IParkedPrompt {
    platform: string;
    conversationId: string;
    prompt: {promptId: string; text: string; kind: string};
}

export default handler(
    ({
        lib: {group},
        handler: {chatOutMessageSend, chatOutPromptForm, chatPromptAsk, chatPromptFind},
    }) => ({
        testChatOutbound: ({name = 'chat outbound'}: {name?: string} = {}) =>
            group(name)([
                async function aMessageReachesThePlatformApi(
                    assert: IAssert,
                    {$meta}: {$meta: IMeta},
                ) {
                    simReset();
                    const result = await chatOutMessageSend(
                        {
                            platform: 'slack',
                            account: 'demo',
                            conversationId: 'D1',
                            text: 'hello',
                        },
                        $meta,
                    );
                    const sent = simRequests('slack').find(entry =>
                        entry.path.endsWith('chat.postMessage'),
                    );
                    assert.ok(sent, 'the Slack port called the message endpoint');
                    assert.equal(
                        (sent.body as {channel?: string}).channel,
                        'D1',
                        'addressed to the conversation it was given',
                    );
                    assert.equal(
                        (sent.body as {text?: string}).text,
                        'hello',
                        'carrying the text it was given',
                    );
                    assert.deepEqual(
                        result,
                        {ok: true, ts: '1700000000.000100', channel: 'D1'},
                        'and answering with what the API said',
                    );
                },

                async function theViberPortSpeaksItsOwnApi(
                    assert: IAssert,
                    {$meta}: {$meta: IMeta},
                ) {
                    simReset();
                    const result = (await chatOutMessageSend(
                        {
                            platform: 'viber',
                            account: 'demo',
                            conversationId: 'U1',
                            text: 'hello viber',
                        },
                        $meta,
                    )) as {status?: number};
                    const sent = simRequests('viber').find(entry =>
                        entry.path.endsWith('send_message'),
                    );
                    assert.ok(sent, 'the Viber port called send_message');
                    assert.equal(
                        (sent.body as {receiver?: string}).receiver,
                        'U1',
                        'addressed to the person it was given',
                    );
                    assert.equal(result.status, 0, 'and a status of zero is a success');
                },

                async function anAccountNothingMatchesIsRefused(
                    assert: IAssert,
                    {$meta}: {$meta: IMeta},
                ) {
                    await assert.rejects(
                        async () =>
                            chatOutMessageSend(
                                {
                                    platform: 'slack',
                                    account: 'nope',
                                    conversationId: 'D1',
                                    text: 'hi',
                                },
                                $meta,
                            ),
                        /No Slack account/,
                        'the refusal names the missing account instead of failing at the platform',
                    );
                },

                async function aQuestionReturnsTheAnswer(assert: IAssert, {$meta}: {$meta: IMeta}) {
                    simReset();
                    const asking = chatPromptAsk(
                        {
                            platform: 'slack',
                            account: 'demo',
                            conversationId: 'D2',
                            text: 'Which one?',
                            kind: 'choice',
                            options: [
                                {value: 'a', label: 'Alpha'},
                                {value: 'b', label: 'Beta'},
                            ],
                            timeoutMs: 8000,
                        },
                        $meta,
                    );
                    const parked = await waitFor(async () => {
                        const found = (await chatPromptFind({}, $meta)) as {
                            prompts: IParkedPrompt[];
                        };
                        return found.prompts.find(entry => entry.conversationId === 'D2');
                    });
                    const posted = await waitFor(() =>
                        simRequests('slack').find(entry => entry.path.endsWith('chat.postMessage')),
                    );
                    assert.ok(posted, 'the question was posted to the conversation');
                    const body = posted.body as {blocks?: unknown[]; text?: string};
                    assert.equal(body.text, 'Which one?', 'as the question it was asked');
                    assert.ok(body.blocks?.length, 'with the controls as blocks');

                    const payload = JSON.stringify({
                        type: 'block_actions',
                        trigger_id: 'trigger-1',
                        channel: {id: 'D2'},
                        user: {id: 'U1'},
                        actions: [
                            {
                                action_id: `chatPrompt:${parked.prompt.promptId}:b`,
                                value: 'b',
                            },
                        ],
                    });
                    const answer = await slackPost(
                        `payload=${encodeURIComponent(payload)}`,
                        'application/x-www-form-urlencoded',
                    );
                    assert.equal(answer.status, 200, 'the interaction is acknowledged');

                    assert.deepEqual(
                        await asking,
                        {promptId: parked.prompt.promptId, value: 'b', sender: {id: 'U1'}},
                        'and the ask returns what the person chose, and who chose it',
                    );
                    // The question's own message is rewritten: the options stay, the pick is marked,
                    // and nothing interactive is left to click (`@@D-692`).
                    const updated = simRequests('slack').find(entry =>
                        entry.path.endsWith('chat.update'),
                    ) as {body?: {ts?: string; blocks?: unknown[]}} | undefined;
                    assert.ok(updated, 'the answer is written over the question, not beside it');
                    assert.equal(
                        updated?.body?.ts,
                        '1700000000.000100',
                        'addressing the message the question was posted as',
                    );
                    const marked = JSON.stringify(updated?.body?.blocks);
                    assert.match(marked, /✅ Beta/, 'the option that was picked is marked');
                    assert.match(marked, /• Alpha/, 'and the one that was not is still shown');
                    assert.match(
                        marked,
                        /🗨️ <@U1> answered/,
                        'and the line names who answered, which the marks cannot say',
                    );
                    assert.equal(
                        /Answer:|_Answer:_/.test(marked),
                        false,
                        'instead of repeating what the marks already show',
                    );
                    assert.doesNotMatch(
                        marked,
                        /"type":"actions"/,
                        'with no control left to press',
                    );
                    assert.deepEqual(
                        simRequests('slack')
                            .filter(entry => entry.path.endsWith('chat.postMessage'))
                            .map(entry => (entry.body as {text?: string}).text),
                        ['Which one?'],
                        'so the conversation holds one message rather than two',
                    );
                },

                async function aQuestionCanAskNotToBeEchoed(
                    assert: IAssert,
                    {$meta}: {$meta: IMeta},
                ) {
                    simReset();
                    const asking = chatPromptAsk(
                        {
                            platform: 'slack',
                            account: 'demo',
                            conversationId: 'D8',
                            text: 'Which one?',
                            kind: 'choice',
                            options: [
                                {value: 'a', label: 'Alpha'},
                                {value: 'b', label: 'Beta'},
                            ],
                            echoAnswer: false,
                            timeoutMs: 8000,
                        },
                        $meta,
                    );
                    const parked = await waitFor(async () => {
                        const found = (await chatPromptFind({}, $meta)) as {
                            prompts: IParkedPrompt[];
                        };
                        return found.prompts.find(entry => entry.conversationId === 'D8');
                    });
                    await waitFor(() =>
                        simRequests('slack').find(entry => entry.path.endsWith('chat.postMessage')),
                    );
                    const payload = JSON.stringify({
                        type: 'block_actions',
                        trigger_id: 'trigger-8',
                        channel: {id: 'D8'},
                        user: {id: 'U1'},
                        actions: [
                            {
                                action_id: `chatPrompt:${parked.prompt.promptId}:a`,
                                value: 'a',
                            },
                        ],
                    });
                    await slackPost(
                        `payload=${encodeURIComponent(payload)}`,
                        'application/x-www-form-urlencoded',
                    );
                    assert.deepEqual(
                        await asking,
                        {promptId: parked.prompt.promptId, value: 'a', sender: {id: 'U1'}},
                        'the ask still returns the answer',
                    );
                    // Both the update and the echo precede the resolution, so what the sim holds
                    // when the call returns is the whole of what was sent — no waiting on an absence.
                    const posted = simRequests('slack')
                        .filter(entry => entry.path.endsWith('chat.postMessage'))
                        .map(entry => (entry.body as {text?: string}).text);
                    assert.deepEqual(
                        posted,
                        ['Which one?'],
                        'and nothing is echoed, because this question asked not to be',
                    );
                    assert.equal(
                        simRequests('slack').filter(entry => entry.path.endsWith('chat.update'))
                            .length,
                        0,
                        'nor is the question rewritten, which would have said the answer out loud',
                    );
                },

                async function anUnansweredQuestionExpires(
                    assert: IAssert,
                    {$meta}: {$meta: IMeta},
                ) {
                    await assert.rejects(
                        async () =>
                            chatPromptAsk(
                                {
                                    platform: 'slack',
                                    account: 'demo',
                                    conversationId: 'D3',
                                    text: 'Anybody?',
                                    kind: 'text',
                                    timeoutMs: 150,
                                },
                                $meta,
                            ),
                        /was not answered within/,
                        'a question nobody answered fails as a timeout instead of holding the request',
                    );
                },

                async function aControlViberCannotRenderIsRefused(
                    assert: IAssert,
                    {$meta}: {$meta: IMeta},
                ) {
                    // No `timeoutMs`: the refusal arrives from the send, so the call never waits, and
                    // the default timeout is the one that is exercised.
                    await assert.rejects(
                        async () =>
                            chatPromptAsk(
                                {
                                    platform: 'viber',
                                    account: 'demo',
                                    conversationId: 'U2',
                                    text: 'Pick two',
                                    kind: 'multiChoice',
                                    options: [{value: 'x', label: 'X'}],
                                },
                                $meta,
                            ),
                        /cannot render the multiChoice control/,
                        'a multiple choice is refused rather than asked as a different question',
                    );
                },

                async function aQuestionIsAnsweredInTheMessageItself(
                    assert: IAssert,
                    {$meta}: {$meta: IMeta},
                ) {
                    simReset();
                    // No `presentation`: inline is the default, and the controls belong where the
                    // question was asked rather than behind a button that opens a dialog.
                    const asking = chatPromptAsk(
                        {
                            platform: 'slack',
                            account: 'demo',
                            conversationId: 'D5',
                            text: 'Which checks should run?',
                            kind: 'multiChoice',
                            options: [
                                {value: 'unit', label: 'Unit tests'},
                                {value: 'lint', label: 'Lint'},
                                {value: 'int', label: 'Integration'},
                            ],
                            timeoutMs: 8000,
                        },
                        $meta,
                    );
                    const parked = await waitFor(async () => {
                        const found = (await chatPromptFind({}, $meta)) as {
                            prompts: IParkedPrompt[];
                        };
                        return found.prompts.find(entry => entry.conversationId === 'D5');
                    });
                    const posted = await waitFor(() =>
                        simRequests('slack').find(entry => entry.path.endsWith('chat.postMessage')),
                    );
                    const blocks =
                        (posted.body as {blocks?: Array<Record<string, unknown>>}).blocks ?? [];
                    const pick = blocks.find(
                        block => block.type === 'actions' && block.block_id === 'pick',
                    );
                    const control = (pick?.elements as Array<Record<string, unknown>>)?.[0];
                    assert.equal(
                        control?.type,
                        'checkboxes',
                        'the options are in the message, as checkboxes',
                    );
                    assert.equal(
                        control?.action_id,
                        `chatPromptPick:${parked.prompt.promptId}`,
                        'carrying the question they belong to',
                    );
                    const submit = blocks.find(
                        block => block.type === 'actions' && block.block_id === 'submit',
                    );
                    assert.match(
                        JSON.stringify(submit),
                        new RegExp(`chatPromptSubmit:${parked.prompt.promptId}`),
                        'with a submit under them, which is what answers',
                    );
                    assert.doesNotMatch(
                        JSON.stringify(blocks),
                        /chatPromptForm:/,
                        'and no button that would open a dialog instead',
                    );

                    // Slack reports the tick and the submit as two interactions: the tick carries
                    // the element's whole selection, the submit carries the message's state.
                    const toggled = await slackPost(
                        `payload=${encodeURIComponent(
                            JSON.stringify({
                                type: 'block_actions',
                                trigger_id: 'trigger-pick',
                                channel: {id: 'D5'},
                                user: {id: 'U1'},
                                actions: [
                                    {
                                        action_id: `chatPromptPick:${parked.prompt.promptId}`,
                                        type: 'checkboxes',
                                        selected_options: [{value: 'unit'}, {value: 'int'}],
                                    },
                                ],
                            }),
                        )}`,
                        'application/x-www-form-urlencoded',
                    );
                    assert.equal(toggled.status, 200, 'the tick is acknowledged');

                    const submitted = await slackPost(
                        `payload=${encodeURIComponent(
                            JSON.stringify({
                                type: 'block_actions',
                                trigger_id: 'trigger-submit',
                                channel: {id: 'D5'},
                                user: {id: 'U1'},
                                actions: [
                                    {
                                        action_id: `chatPromptSubmit:${parked.prompt.promptId}`,
                                        type: 'button',
                                        value: parked.prompt.promptId,
                                    },
                                ],
                                state: {
                                    values: {
                                        pick: {
                                            [`chatPromptPick:${parked.prompt.promptId}`]: {
                                                type: 'checkboxes',
                                                selected_options: [{value: 'unit'}, {value: 'int'}],
                                            },
                                        },
                                    },
                                },
                            }),
                        )}`,
                        'application/x-www-form-urlencoded',
                    );
                    assert.equal(submitted.status, 200, 'the submit is acknowledged');
                    assert.deepEqual(
                        await asking,
                        {
                            promptId: parked.prompt.promptId,
                            values: ['unit', 'int'],
                            sender: {id: 'U1'},
                        },
                        'and the ask returns what the message was holding',
                    );
                },

                async function aSubmitWithoutStateAnswersWhatWasTicked(
                    assert: IAssert,
                    {$meta}: {$meta: IMeta},
                ) {
                    simReset();
                    const asking = chatPromptAsk(
                        {
                            platform: 'slack',
                            account: 'demo',
                            conversationId: 'D6',
                            text: 'Which one?',
                            kind: 'choice',
                            options: [
                                {value: 'dev', label: 'Development'},
                                {value: 'prod', label: 'Production'},
                            ],
                            timeoutMs: 8000,
                        },
                        $meta,
                    );
                    const parked = await waitFor(async () => {
                        const found = (await chatPromptFind({}, $meta)) as {
                            prompts: IParkedPrompt[];
                        };
                        return found.prompts.find(entry => entry.conversationId === 'D6');
                    });
                    await waitFor(() =>
                        simRequests('slack').find(entry => entry.path.endsWith('chat.postMessage')),
                    );
                    // A radio group reports every change, and this submit arrives without the
                    // message's state — the tick that preceded it is what answers.
                    await slackPost(
                        `payload=${encodeURIComponent(
                            JSON.stringify({
                                type: 'block_actions',
                                trigger_id: 'trigger-radio',
                                channel: {id: 'D6'},
                                user: {id: 'U1'},
                                actions: [
                                    {
                                        action_id: `chatPromptPick:${parked.prompt.promptId}`,
                                        type: 'radio_buttons',
                                        selected_option: {value: 'prod'},
                                    },
                                ],
                            }),
                        )}`,
                        'application/x-www-form-urlencoded',
                    );
                    await slackPost(
                        `payload=${encodeURIComponent(
                            JSON.stringify({
                                type: 'block_actions',
                                trigger_id: 'trigger-submit',
                                channel: {id: 'D6'},
                                user: {id: 'U1'},
                                actions: [
                                    {
                                        action_id: `chatPromptSubmit:${parked.prompt.promptId}`,
                                        type: 'button',
                                        value: parked.prompt.promptId,
                                    },
                                ],
                            }),
                        )}`,
                        'application/x-www-form-urlencoded',
                    );
                    assert.deepEqual(
                        await asking,
                        {promptId: parked.prompt.promptId, value: 'prod', sender: {id: 'U1'}},
                        'a submit with no state is answered with the selection the tick reported',
                    );
                },

                async function aFreeTextQuestionIsAnsweredByReply(
                    assert: IAssert,
                    {$meta}: {$meta: IMeta},
                ) {
                    simReset();
                    // A message cannot hold a text box, so an inline free-text question asks for the
                    // reply it is posted in — and a pending question claims the next one.
                    const asking = chatPromptAsk(
                        {
                            platform: 'slack',
                            account: 'demo',
                            conversationId: 'D9',
                            text: 'What should the release be called?',
                            kind: 'text',
                            placeholder: 'v1.2.0-rc.1',
                            timeoutMs: 8000,
                        },
                        $meta,
                    );
                    const parked = await waitFor(async () => {
                        const found = (await chatPromptFind({}, $meta)) as {
                            prompts: IParkedPrompt[];
                        };
                        return found.prompts.find(entry => entry.conversationId === 'D9');
                    });
                    const posted = await waitFor(() =>
                        simRequests('slack').find(entry => entry.path.endsWith('chat.postMessage')),
                    );
                    const blocks = JSON.stringify((posted.body as {blocks?: unknown[]}).blocks);
                    assert.match(blocks, /reply here/, 'the message says how to answer');
                    assert.doesNotMatch(
                        blocks,
                        /plain_text_input/,
                        'without a text field it cannot have',
                    );

                    const reply = await slackPost(
                        JSON.stringify({
                            type: 'event_callback',
                            event_id: 'Ev-inline-text',
                            event: {
                                type: 'message',
                                client_msg_id: 'Ev-inline-text',
                                ts: '1700000000.000200',
                                channel: 'D9',
                                user: 'U1',
                                text: 'v2.0.0',
                            },
                        }),
                        'application/json',
                    );
                    assert.equal(reply.status, 200, 'the reply is acknowledged');
                    assert.deepEqual(
                        await asking,
                        {promptId: parked.prompt.promptId, text: 'v2.0.0', sender: {id: 'U1'}},
                        'and it answers the question waiting in that conversation',
                    );
                },

                async function aMultipleChoiceIsAnsweredInAForm(
                    assert: IAssert,
                    {$meta}: {$meta: IMeta},
                ) {
                    simReset();
                    const asking = chatPromptAsk(
                        {
                            platform: 'slack',
                            account: 'demo',
                            conversationId: 'D4',
                            text: 'Pick any two',
                            kind: 'multiChoice',
                            options: [
                                {value: 'x', label: 'X'},
                                {value: 'y', label: 'Y'},
                            ],
                            presentation: 'form',
                            timeoutMs: 8000,
                        },
                        $meta,
                    );
                    const parked = await waitFor(async () => {
                        const found = (await chatPromptFind({}, $meta)) as {
                            prompts: IParkedPrompt[];
                        };
                        return found.prompts.find(entry => entry.conversationId === 'D4');
                    });
                    const posted = await waitFor(() =>
                        simRequests('slack').find(entry => entry.path.endsWith('chat.postMessage')),
                    );
                    const blocks = (posted.body as {blocks?: unknown[]}).blocks ?? [];
                    // The control that cannot be a button opens the modal instead: one button per
                    // question, carrying the form action id rather than a value.
                    const button = /chatPromptForm:([^"]+)/.exec(JSON.stringify(blocks))?.[1];
                    assert.equal(
                        button,
                        parked.prompt.promptId,
                        'the question posted a form button instead of pretending to be checkboxes',
                    );

                    const opened = await slackPost(
                        `payload=${encodeURIComponent(
                            JSON.stringify({
                                type: 'block_actions',
                                trigger_id: 'trigger-form',
                                channel: {id: 'D4'},
                                user: {id: 'U1'},
                                actions: [{action_id: `chatPromptForm:${button}`, value: ''}],
                            }),
                        )}`,
                        'application/x-www-form-urlencoded',
                    );
                    assert.equal(opened.status, 200, 'the click is acknowledged');
                    assert.deepEqual(
                        JSON.parse(opened.text),
                        {},
                        'with an object, which is what Slack’s client parses for an interaction',
                    );
                    const modal = await waitFor(() =>
                        simRequests('slack').find(entry => entry.path.endsWith('views.open')),
                    );
                    assert.equal(
                        (modal.body as {trigger_id?: string}).trigger_id,
                        'trigger-form',
                        'and the modal is opened for that interaction',
                    );
                    assert.deepEqual(
                        simRequests().filter(entry => entry.platform === 'viber'),
                        [],
                        'while every call so far was Slack’s',
                    );

                    const submitted = await slackPost(
                        `payload=${encodeURIComponent(
                            JSON.stringify({
                                type: 'view_submission',
                                user: {id: 'U1'},
                                view: {
                                    private_metadata: JSON.stringify({
                                        promptId: parked.prompt.promptId,
                                        conversationId: 'D4',
                                    }),
                                    state: {
                                        values: {
                                            // The checkboxes block is `block_id: 'values'`, so the
                                            // view carries what was ticked under that name.
                                            values: {
                                                value: {
                                                    selected_options: [{value: 'y'}, {value: 'x'}],
                                                },
                                            },
                                        },
                                    },
                                },
                            }),
                        )}`,
                        'application/x-www-form-urlencoded',
                    );
                    assert.equal(submitted.status, 200, 'the submission is acknowledged');
                    assert.deepEqual(
                        JSON.parse(submitted.text),
                        {response_action: 'clear'},
                        'and the modal is dismissed — Slack keeps it open over any other body',
                    );
                    assert.deepEqual(
                        await asking,
                        {
                            promptId: parked.prompt.promptId,
                            values: ['y', 'x'],
                            sender: {id: 'U1'},
                        },
                        'and the ask returns what was ticked in the form',
                    );
                },

                async function aChoiceWithAnAlternativeIsAnsweredInARadioForm(
                    assert: IAssert,
                    {$meta}: {$meta: IMeta},
                ) {
                    simReset();
                    // `placeholder` is the caller asking for options *and* somewhere to type: the
                    // editor's question tool does both, and a message cannot carry a text input.
                    const asking = chatPromptAsk(
                        {
                            platform: 'slack',
                            account: 'demo',
                            conversationId: 'D7',
                            text: 'Which environment?',
                            kind: 'choice',
                            options: [
                                {value: 'dev', label: 'Development'},
                                {value: 'prod', label: 'Production'},
                            ],
                            placeholder: 'Another environment',
                            presentation: 'form',
                            timeoutMs: 8000,
                        },
                        $meta,
                    );
                    const parked = await waitFor(async () => {
                        const found = (await chatPromptFind({}, $meta)) as {
                            prompts: IParkedPrompt[];
                        };
                        return found.prompts.find(entry => entry.conversationId === 'D7');
                    });
                    const posted = await waitFor(() =>
                        simRequests('slack').find(entry => entry.path.endsWith('chat.postMessage')),
                    );
                    const blocks = JSON.stringify((posted.body as {blocks?: unknown[]}).blocks);
                    assert.match(
                        blocks,
                        /chatPromptForm:/,
                        'the message opens the form rather than posting buttons',
                    );
                    assert.doesNotMatch(
                        blocks,
                        /chatPrompt:[0-9a-f-]+:/,
                        'because an answer may be typed instead of picked',
                    );

                    const opened = await slackPost(
                        `payload=${encodeURIComponent(
                            JSON.stringify({
                                type: 'block_actions',
                                trigger_id: 'trigger-radio',
                                channel: {id: 'D7'},
                                user: {id: 'U1'},
                                actions: [
                                    {
                                        action_id: `chatPromptForm:${parked.prompt.promptId}`,
                                        value: '',
                                    },
                                ],
                            }),
                        )}`,
                        'application/x-www-form-urlencoded',
                    );
                    assert.equal(opened.status, 200, 'the click is acknowledged');
                    assert.deepEqual(
                        JSON.parse(opened.text),
                        {},
                        'with an object, which is what Slack’s client parses for an interaction',
                    );
                    const modal = await waitFor(() =>
                        simRequests('slack').find(entry => entry.path.endsWith('views.open')),
                    );
                    const view = (modal.body as {view?: {blocks?: Array<Record<string, unknown>>}})
                        .view;
                    const kinds = (view?.blocks ?? [])
                        .map(block => (block.element as {type?: string} | undefined)?.type)
                        .filter(Boolean);
                    assert.deepEqual(
                        kinds,
                        ['radio_buttons', 'plain_text_input'],
                        'a radio button per option, and a box for something else',
                    );
                    assert.equal(
                        (view?.blocks?.[1] as {optional?: boolean} | undefined)?.optional,
                        true,
                        'neither control is required, because either one answers',
                    );

                    const submitted = await slackPost(
                        `payload=${encodeURIComponent(
                            JSON.stringify({
                                type: 'view_submission',
                                user: {id: 'U1'},
                                view: {
                                    private_metadata: JSON.stringify({
                                        promptId: parked.prompt.promptId,
                                        conversationId: 'D7',
                                    }),
                                    state: {
                                        values: {
                                            choice: {value: {selected_option: {value: 'prod'}}},
                                            text: {value: {value: 'staging'}},
                                        },
                                    },
                                },
                            }),
                        )}`,
                        'application/x-www-form-urlencoded',
                    );
                    assert.equal(submitted.status, 200, 'the submission is acknowledged');
                    assert.deepEqual(
                        JSON.parse(submitted.text),
                        {response_action: 'clear'},
                        'and the modal is dismissed — Slack keeps it open over any other body',
                    );
                    assert.deepEqual(
                        await asking,
                        {
                            promptId: parked.prompt.promptId,
                            value: 'prod',
                            text: 'staging',
                            sender: {id: 'U1'},
                        },
                        'and the ask returns both what was picked and what was typed',
                    );
                },

                async function aRefusedEchoDoesNotLoseTheAnswer(
                    assert: IAssert,
                    {$meta}: {$meta: IMeta},
                ) {
                    simReset();
                    // `C-once` is the simulator's conversation that takes the question and refuses
                    // what follows it: a bot removed while the question was waiting.
                    const asking = chatPromptAsk(
                        {
                            platform: 'slack',
                            account: 'demo',
                            conversationId: 'C-once',
                            text: 'Which one?',
                            kind: 'choice',
                            options: [{value: 'a', label: 'Alpha'}],
                            timeoutMs: 8000,
                        },
                        $meta,
                    );
                    const parked = await waitFor(async () => {
                        const found = (await chatPromptFind({}, $meta)) as {
                            prompts: IParkedPrompt[];
                        };
                        return found.prompts.find(entry => entry.conversationId === 'C-once');
                    });
                    await waitFor(() =>
                        simRequests('slack').find(entry => entry.path.endsWith('chat.postMessage')),
                    );
                    const payload = JSON.stringify({
                        type: 'block_actions',
                        trigger_id: 'trigger-9',
                        channel: {id: 'C-once'},
                        user: {id: 'U1'},
                        actions: [
                            {action_id: `chatPrompt:${parked.prompt.promptId}:a`, value: 'a'},
                        ],
                    });
                    await slackPost(
                        `payload=${encodeURIComponent(payload)}`,
                        'application/x-www-form-urlencoded',
                    );
                    assert.deepEqual(
                        await asking,
                        {promptId: parked.prompt.promptId, value: 'a', sender: {id: 'U1'}},
                        'the answer is the caller’s even when the channel cannot be written to',
                    );
                    assert.equal(
                        simRequests('slack').filter(entry =>
                            entry.path.endsWith('chat.postMessage'),
                        ).length,
                        2,
                        'the echo was attempted after the answer was taken',
                    );
                    await assert.rejects(
                        async () =>
                            chatOutMessageSend(
                                {
                                    platform: 'slack',
                                    account: 'demo',
                                    conversationId: 'C-once',
                                    text: 'and anything after it',
                                },
                                $meta,
                            ),
                        /the conversation is not one the app can see/,
                        'because the conversation had stopped taking messages, which is the echo’s refusal',
                    );
                },

                async function aRefusedQuestionFailsWithoutWaiting(
                    assert: IAssert,
                    {$meta}: {$meta: IMeta},
                ) {
                    // No `timeoutMs`: a refusal that arrived as a value used to read as a success,
                    // so the ask waited for a person in a conversation the platform had refused.
                    await assert.rejects(
                        async () =>
                            chatPromptAsk(
                                {
                                    platform: 'slack',
                                    account: 'demo',
                                    conversationId: 'C-never',
                                    text: 'Which one?',
                                    kind: 'choice',
                                    options: [{value: 'a', label: 'Alpha'}],
                                },
                                $meta,
                            ),
                        /the conversation is not one the app can see/,
                        'a refused question fails at once rather than at the timeout',
                    );
                },

                async function aTypedReplyAnswersTheQuestionItBelongsTo(
                    assert: IAssert,
                    {$meta}: {$meta: IMeta},
                ) {
                    simReset();
                    const asking = chatPromptAsk(
                        {
                            platform: 'viber',
                            account: 'demo',
                            conversationId: 'U3',
                            text: 'What is your order number?',
                            kind: 'text',
                            timeoutMs: 8000,
                        },
                        $meta,
                    );
                    const parked = await waitFor(async () => {
                        const found = (await chatPromptFind({}, $meta)) as {
                            prompts: IParkedPrompt[];
                        };
                        return found.prompts.find(entry => entry.conversationId === 'U3');
                    });
                    const body = JSON.stringify({
                        event: 'message',
                        timestamp: 1700000000000,
                        message_token: 1700000000001,
                        sender: {id: 'U3', name: 'Someone'},
                        message: {type: 'text', text: 'A-1234'},
                    });
                    const answer = await viberPost(body);
                    assert.equal(answer.status, 200, 'the reply is acknowledged');

                    assert.deepEqual(
                        await asking,
                        {
                            promptId: parked.prompt.promptId,
                            text: 'A-1234',
                            sender: {id: 'U3', name: 'Someone'},
                        },
                        'a typed reply carries no prompt id, so it answers the question waiting here',
                    );
                    const edited = simRequests('viber').find(entry =>
                        entry.path.endsWith('edit_message'),
                    ) as {body?: {message_token?: number; text?: string}} | undefined;
                    assert.ok(
                        edited,
                        'and the question is rewritten in place, without its keyboard',
                    );
                    assert.equal(
                        edited?.body?.message_token,
                        1700000000000,
                        'addressing the message the question was posted as',
                    );
                    assert.match(
                        edited?.body?.text ?? '',
                        /What is your order number\? — Someone answered: A-1234/,
                        'Viber has no blocks to mark, so the message names who answered and what',
                    );
                },

                async function aPlatformTheRealmDoesNotSpeakIsRefused(
                    assert: IAssert,
                    {$meta}: {$meta: IMeta},
                ) {
                    await assert.rejects(
                        async () =>
                            chatOutMessageSend(
                                {
                                    platform: 'telegram',
                                    conversationId: 'T1',
                                    text: 'hi',
                                } as unknown as Parameters<typeof chatOutMessageSend>[0],
                                $meta,
                            ),
                        /cannot render the message control/,
                        'a platform with no port is refused where the choice is made',
                    );
                },

                async function aFormIsNotOfferedWhereNoneCanOpen(
                    assert: IAssert,
                    {$meta}: {$meta: IMeta},
                ) {
                    // Viber has no modal to open, so the form request a Slack click would make is a
                    // capability answer rather than a call the platform cannot serve.
                    const asking = chatPromptAsk(
                        {
                            platform: 'viber',
                            account: 'demo',
                            conversationId: 'U4',
                            text: 'Which one?',
                            kind: 'text',
                            timeoutMs: 150,
                        },
                        $meta,
                    );
                    const parked = await waitFor(async () => {
                        const found = (await chatPromptFind({}, $meta)) as {
                            prompts: IParkedPrompt[];
                        };
                        return found.prompts.find(entry => entry.conversationId === 'U4');
                    });
                    await assert.rejects(
                        async () =>
                            chatOutPromptForm(
                                {
                                    platform: 'viber',
                                    account: 'demo',
                                    conversationId: 'U4',
                                    promptId: parked.prompt.promptId,
                                    triggerId: 'trigger-1',
                                },
                                $meta,
                            ),
                        /cannot render the form control/,
                        'the platform that cannot open a form says so',
                    );
                    await assert.rejects(
                        async () => asking,
                        /was not answered within/,
                        'and the question it belonged to still expires on its own',
                    );
                },

                async function aClickOnAButtonThatExpiredIsAcknowledged(assert: IAssert) {
                    // The modal opens from an interaction, so the click is the only place a stale
                    // question can be noticed: the prompt store no longer holds it, and the platform
                    // still has to be told the click was received.
                    const answer = await slackPost(
                        `payload=${encodeURIComponent(
                            JSON.stringify({
                                type: 'block_actions',
                                trigger_id: 'trigger-stale',
                                channel: {id: 'D7'},
                                user: {id: 'U1'},
                                actions: [
                                    {
                                        action_id:
                                            'chatPromptForm:00000000-0000-4000-8000-000000000000',
                                        value: '',
                                    },
                                ],
                            }),
                        )}`,
                        'application/x-www-form-urlencoded',
                    );
                    assert.equal(
                        answer.status,
                        200,
                        'a button that outlived its question still gets its acknowledgement',
                    );
                },

                async function theSimulatorRefusesAMethodItDoesNotImplement(assert: IAssert) {
                    const response = await fetch(
                        `http://127.0.0.1:${TEST_PORTS.slackSim}/api/conversations.list`,
                        {
                            method: 'POST',
                            headers: {'content-type': 'application/json'},
                            body: JSON.stringify({}),
                        },
                    );
                    assert.deepEqual(
                        await response.json(),
                        {ok: false, error: 'unknown_method'},
                        'a call nobody expected cannot pass by looking like a success',
                    );
                },
            ]),
    }),
);
