import {createHmac} from 'node:crypto';

import type {IChatPrompt} from '@feasibleone/blong/types';
import {test} from 'tap';

import {
    chatAccountBase,
    chatAccountFind,
    chatAccountName,
    chatPublicUrl,
} from '../../chatAccounts.ts';
import {
    chatPromptActionId,
    chatPromptActionParse,
    chatPromptFormActionId,
    chatPromptPickActionId,
    chatPromptSubmitActionId,
} from '../../chatActions.ts';
import {ngrokPublicUrl} from './ngrokTunnels.ts';
import {slackPromptAnsweredBlocks, slackPromptBlocks, slackPromptView} from './slack/blocks.ts';
import {slackAcknowledgeGet} from './slackIn/acknowledge.ts';
import {slackSignatureMatches} from './slackIn/signature.ts';
import {slackManifestPointsAt, slackManifestRepoint, slackRequestUrl} from './slackManifest.ts';
import {viberPromptButtons, viberPromptKeyboard} from './viber/keyboard.ts';
import {viberSignatureMatches} from './viberIn/signature.ts';

/**
 * Both chat ports, asserted where a live workspace cannot reach: the signature rules, the identifier a
 * button carries back, and the controls each platform renders. The mapping from a real payload is
 * covered end to end by `realm/blong-chat`'s tap groups, which post signed bodies to a real listener.
 */

const body = Buffer.from('{"type":"event_callback","event_id":"Ev1"}');
const secret = 'shhh';
const slack = (
    now: number,
    overrides: {signature?: string; timestamp?: string; secret?: string} = {},
) => {
    const timestamp = overrides.timestamp ?? String(Math.floor(now / 1000));
    const used = overrides.secret ?? secret;
    const signature =
        overrides.signature ??
        'v0=' + createHmac('sha256', used).update(`v0:${timestamp}:`).update(body).digest('hex');
    return {secret: used, timestamp, signature, rawBody: body, now};
};

test('an interaction is answered with the JSON Slack’s own client reads', t => {
    t.same(
        slackAcknowledgeGet({payload: JSON.stringify({type: 'view_submission'})}),
        {code: 200, body: {response_action: 'clear'}},
        'a submission clears the view stack, which is the only answer that dismisses the modal',
    );
    t.same(
        slackAcknowledgeGet({payload: JSON.stringify({type: 'block_actions', actions: []})}),
        {code: 200, body: {}},
        'a button click is acknowledged with an object Slack ignores',
    );
    t.same(
        slackAcknowledgeGet({payload: 'not json'}),
        {code: 200, body: {}},
        'a payload that does not parse is still an interaction, and is acknowledged',
    );
    t.equal(
        slackAcknowledgeGet({type: 'event_callback', event_id: 'Ev1'}),
        undefined,
        'an event keeps the port’s EVENT_RECEIVED',
    );
    t.equal(slackAcknowledgeGet(undefined), undefined, 'and so does a request with no body');
    t.end();
});

test('a Slack request signed now is the one whose bytes match', t => {
    const now = Date.now();
    t.equal(slackSignatureMatches(slack(now)), true, 'the request verifies');
    t.equal(
        slackSignatureMatches({...slack(now), secret: 'other'}),
        false,
        'a signature made with another secret does not verify',
    );
    t.equal(
        slackSignatureMatches(slack(now, {signature: 'v0=deadbeef'})),
        false,
        'a made-up digest does not',
    );
    t.equal(
        slackSignatureMatches({...slack(now), now: now + 10 * 60 * 1000}),
        false,
        'a replay outside the window does not',
    );
    t.equal(
        slackSignatureMatches({...slack(now), rawBody: Buffer.from('{}')}),
        false,
        'the body that was signed is the only body that matches',
    );
    t.end();
});

test('a Viber request is signed with the auth token', t => {
    const token = 'pa:token';
    const signature = createHmac('sha256', token).update(body).digest('hex');
    t.equal(
        viberSignatureMatches({authToken: token, signature, rawBody: body}),
        true,
        'the request verifies',
    );
    t.equal(
        viberSignatureMatches({authToken: 'other', signature, rawBody: body}),
        false,
        'another token does not',
    );
    t.equal(
        viberSignatureMatches({authToken: token, signature, rawBody: Buffer.from('{}')}),
        false,
        'nor another body',
    );
    t.equal(
        viberSignatureMatches({authToken: token, rawBody: body}),
        false,
        'nor a missing signature',
    );
    t.end();
});

test('a button carries its question, and a value may contain a colon', t => {
    const id = chatPromptActionId('p1', 'v1:2');
    t.same(
        chatPromptActionParse(id),
        {promptId: 'p1', form: false, value: 'v1:2'},
        'the value survives a colon of its own',
    );
    t.same(
        chatPromptActionParse(chatPromptFormActionId('p1')),
        {promptId: 'p1', form: true},
        'a form request is told apart from an answer',
    );
    t.same(
        chatPromptActionParse(chatPromptPickActionId('p1')),
        {promptId: 'p1', form: false, pick: true},
        'an inline control toggle is its own kind, because it answers nothing yet',
    );
    t.same(
        chatPromptActionParse(chatPromptSubmitActionId('p1')),
        {promptId: 'p1', form: false, submit: true},
        'and the submit under it is what answers',
    );
    t.equal(
        chatPromptActionParse('someoneElse'),
        undefined,
        'a button this port did not add is not ours',
    );
    t.end();
});

const prompt = (overrides: Partial<IChatPrompt>): IChatPrompt => ({
    promptId: 'p1',
    kind: 'choice',
    text: 'Which one?',
    options: [
        {value: 'a', label: 'Alpha'},
        {value: 'b', label: 'Beta'},
    ],
    ...overrides,
});

test('Slack asks in the message itself unless the question asks for a form', t => {
    type Block = {
        type?: string;
        block_id?: string;
        elements?: Array<{type?: string; action_id?: string; text?: {text: string}}>;
        text?: {text?: string};
    };
    // Inline is the default: the options are the message, not a button that opens a dialog.
    const choice = slackPromptBlocks(prompt({})) as Block[];
    t.equal(choice[1]?.block_id, 'pick', 'a choice holds its controls in the message');
    t.equal(choice[1]?.elements?.[0]?.type, 'radio_buttons', 'as one radio button per option');
    t.equal(
        choice[1]?.elements?.[0]?.action_id,
        chatPromptPickActionId('p1'),
        'naming the question the selection answers',
    );
    t.equal(choice[2]?.block_id, 'submit', 'with a submit under the options, as a form has');
    t.equal(
        choice[2]?.elements?.[0]?.action_id,
        chatPromptSubmitActionId('p1'),
        'which is what settles the ask',
    );
    t.same(
        (
            choice[1]?.elements?.[0] as unknown as {options: Array<{text: {text: string}}>}
        ).options.map(option => option.text.text),
        ['Alpha', 'Beta'],
        'and the options say what a person reads',
    );

    const multi = slackPromptBlocks(prompt({kind: 'multiChoice'})) as Block[];
    t.equal(multi[1]?.elements?.[0]?.type, 'checkboxes', 'a multiple choice is checkboxes inline');

    const typed = slackPromptBlocks(prompt({kind: 'text', options: undefined, placeholder: 'v1'}));
    const typedBlocks = typed as Block[];
    t.equal(typedBlocks.length, 2, 'a free-text question has nothing to submit');
    t.match(
        typedBlocks[1]?.elements?.[0]?.text ?? '',
        /reply here: v1/,
        'so it asks for the reply it cannot show a field for',
    );

    const confirm = slackPromptBlocks(prompt({kind: 'confirm', options: undefined})) as Block[];
    t.same(
        (confirm[1]?.elements as Array<{action_id: string}>).map(action => action.action_id),
        [chatPromptActionId('p1', 'yes'), chatPromptActionId('p1', 'no')],
        'a confirmation is two buttons, which is already inline',
    );

    for (const kind of ['multiChoice', 'text'] as const) {
        const blocks = slackPromptBlocks(
            prompt({kind, placeholder: kind === 'text' ? 'v1' : undefined, presentation: 'form'}),
        ) as Block[];
        t.equal(
            blocks[1]?.elements?.[0]?.action_id,
            chatPromptFormActionId('p1'),
            `a ${kind} question asked for a form offers the door to one`,
        );
    }
    t.end();
});

test('an answered question keeps its options and loses its controls', t => {
    type Block = {type?: string; elements?: Array<{text?: string}>; text?: {text?: string}};
    const blocks = slackPromptAnsweredBlocks(
        prompt({}),
        {promptId: 'p1', value: 'b'},
        'Beta',
    ) as Block[];
    t.same(
        blocks.map(block => block.type),
        ['section', 'section', 'context'],
        'the question, its options and the answer, in that order',
    );
    t.equal(
        blocks[1]?.text?.text,
        '• Alpha\n✅ Beta',
        'every option stays, and the one that was picked is the one marked',
    );
    t.match(
        blocks[2]?.elements?.[0]?.text ?? '',
        /_Answer:_ Beta/,
        'the answer is named in the label the person saw, not the value',
    );
    t.equal(
        /actions|radio_buttons|checkboxes|plain_text_input/.test(JSON.stringify(blocks)),
        false,
        'and nothing interactive is left to press, because there is nothing left to answer',
    );

    // A Slack mention renders as that person's avatar and name, which is the one thing the marks
    // cannot say (`@@D-693`).
    const byPerson = slackPromptAnsweredBlocks(
        prompt({}),
        {promptId: 'p1', value: 'b', sender: {id: 'U1', name: 'Someone'}},
        'Beta',
    ) as Block[];
    t.equal(
        byPerson[2]?.elements?.[0]?.text,
        '🗨️ <@U1> answered',
        'a marked option is not repeated; the person who picked it is named instead',
    );

    const withTyped = slackPromptAnsweredBlocks(
        prompt({}),
        {promptId: 'p1', value: 'b', text: 'or maybe c', sender: {id: 'U1'}},
        'Beta — or maybe c',
    ) as Block[];
    t.equal(
        withTyped[2]?.elements?.[0]?.text,
        '🗨️ <@U1> answered: or maybe c',
        'something typed is still named, because no mark can carry it',
    );

    const named = slackPromptAnsweredBlocks(
        prompt({}),
        {promptId: 'p1', value: 'b', sender: {name: 'Someone'}},
        'Beta',
    ) as Block[];
    t.equal(
        named[2]?.elements?.[0]?.text,
        '🗨️ Someone answered',
        'a port that knows only a name uses the name',
    );

    const ticked = slackPromptAnsweredBlocks(
        prompt({kind: 'multiChoice'}),
        {promptId: 'p1', values: ['a', 'b']},
        'Alpha, Beta',
    ) as Block[];
    t.equal(
        ticked[1]?.text?.text,
        '✅ Alpha\n✅ Beta',
        'every box that was ticked is marked, and the order stays the question’s',
    );

    const typed = slackPromptAnsweredBlocks(
        prompt({kind: 'text', options: undefined}),
        {promptId: 'p1', text: 'v1.2.0', sender: {id: 'U1'}},
        'v1.2.0',
    ) as Block[];
    t.equal(typed.length, 2, 'a free-text answer has no options to keep');
    t.equal(
        typed[1]?.elements?.[0]?.text,
        '🗨️ <@U1> answered: v1.2.0',
        'so the line carries the answer the person typed',
    );

    const confirmed = slackPromptAnsweredBlocks(
        prompt({kind: 'confirm', options: undefined}),
        {promptId: 'p1', value: 'yes', sender: {id: 'U1'}},
        'Yes',
    ) as Block[];
    t.equal(
        confirmed[1]?.elements?.[0]?.text,
        '🗨️ <@U1> answered: Yes',
        'a confirmation reads as a word, not as the value a caller switches on',
    );

    const empty = slackPromptAnsweredBlocks(prompt({}), {promptId: 'p1'}, '(empty)') as Block[];
    t.match(
        empty[2]?.elements?.[0]?.text ?? '',
        /_Answer:_ \(empty\)/,
        'and a form submitted with nothing picked says so rather than saying nothing',
    );
    t.end();
});

test('the Slack form carries the control the question asked for', t => {
    type Block = {
        block_id?: string;
        element?: {type?: string; options?: Array<{value?: string}>};
    };
    const multi = slackPromptView(prompt({kind: 'multiChoice'}), 'D1') as {
        private_metadata: string;
        blocks: Block[];
    };
    t.same(
        JSON.parse(multi.private_metadata),
        {promptId: 'p1', conversationId: 'D1'},
        'the submission can find its question and the conversation it belongs to',
    );
    t.equal(
        multi.blocks[1]?.block_id,
        'values',
        'checkboxes answer under the block the mapper reads',
    );
    t.equal(multi.blocks[1]?.element?.type, 'checkboxes', 'and the element is the checkbox group');
    t.same(
        (multi.blocks[1]?.element?.options as Array<{value: string}>).map(option => option.value),
        ['a', 'b'],
        'with one box per option',
    );

    const free = slackPromptView(prompt({kind: 'text'}), 'D1') as {
        blocks: Block[];
    };
    t.equal(free.blocks[1]?.block_id, 'text', 'free text answers under its own block');
    t.equal(free.blocks[1]?.element?.type, 'plain_text_input', 'and the element is a text input');
    t.end();
});

test('an option list may also accept something typed', t => {
    type Block = {block_id?: string; optional?: boolean; element?: {type?: string}};
    // A placeholder is the caller saying "or type it": the message opens the form, and the form
    // carries the radio group *and* a text box, which is the pair an editor's question tool offers.
    const inline = slackPromptBlocks(prompt({placeholder: 'Other'})) as Array<{
        block_id?: string;
        elements?: Array<{action_id?: string; text?: {text: string}}>;
    }>;
    t.equal(inline[1]?.block_id, 'pick', 'inline, the choice is still a radio group');
    t.equal(inline[2]?.block_id, 'submit', 'with a submit under it');
    t.match(
        (inline[3]?.elements?.[0] as {text?: string} | undefined)?.text ?? '',
        /or reply here: Other/,
        'and a line saying a typed reply answers too, which a message cannot show as a field',
    );

    const blocks = slackPromptBlocks(
        prompt({placeholder: 'Other', presentation: 'form'}),
    ) as Array<{
        elements?: Array<{action_id?: string}>;
    }>;
    t.equal(
        blocks[1]?.elements?.[0]?.action_id,
        chatPromptFormActionId('p1'),
        'a form is what puts the radio group and the text box in one place',
    );

    const view = slackPromptView(prompt({placeholder: 'Other'}), 'D1') as {blocks: Block[]};
    t.same(
        view.blocks.slice(1).map(block => [block.block_id, block.element?.type, block.optional]),
        [
            ['choice', 'radio_buttons', true],
            ['text', 'plain_text_input', true],
        ],
        'a radio button per option beside a box for something else, either one answering',
    );

    const typed = slackPromptView(prompt({kind: 'text'}), 'D1') as {blocks: Block[]};
    t.equal(typed.blocks[1]?.optional, false, 'a text-only question has to be answered');
    t.end();
});

test('Viber renders a choice as a keyboard and a typed answer as no keyboard at all', t => {
    const buttons = viberPromptButtons(prompt({}));
    t.same(
        buttons.map(button => button.ActionBody),
        [chatPromptActionId('p1', 'a'), chatPromptActionId('p1', 'b')],
        'a reply button sends the question and its value as the next text',
    );
    t.same(
        viberPromptButtons(prompt({kind: 'confirm', options: undefined})).map(
            button => button.Text,
        ),
        ['Yes', 'No'],
        'a confirmation is two buttons',
    );
    t.same(
        viberPromptKeyboard(prompt({})),
        {
            Type: 'keyboard',
            DefaultHeight: false,
            Buttons: buttons,
        },
        'the keyboard wraps them the way the API expects',
    );
    t.equal(
        viberPromptKeyboard(prompt({kind: 'text'})),
        undefined,
        'a typed answer needs no keyboard',
    );
    t.end();
});

test('an account is found by what the path names, and named when there is only one', t => {
    const accounts = {
        demo: {appId: 'A1', clientId: 'T1', botToken: 'xoxb-1'},
        other: {appId: 'A2', clientId: 'T2', botToken: 'xoxb-2'},
    };
    t.equal(chatAccountFind(accounts, 'A1', 'T1')?.name, 'demo', 'the pair names the account');
    t.equal(chatAccountFind(accounts, 'A1', 'T2'), undefined, 'half a pair names nothing');
    t.equal(chatAccountName(accounts, 'other'), 'other', 'a named account is kept');
    t.equal(chatAccountName({demo: {}}, undefined), 'demo', 'the only account needs no name');
    t.equal(chatAccountName(accounts, undefined), undefined, 'two accounts need to be told apart');
    t.equal(
        chatPublicUrl('/chat/slack/{appId}/{clientId}/{action?}', 'https://x.ngrok.app/', {
            appId: 'A1',
            clientId: 'T1',
        }),
        'https://x.ngrok.app/chat/slack/A1/T1',
        'the public address is the port path with the ids a request names',
    );
    t.end();
});

test('the tunnel that publishes one port is the one the agent names for it', t => {
    const tunnels = {
        tunnels: [
            {
                public_url: 'http://old.example.test',
                proto: 'http',
                config: {addr: 'http://localhost:8095'},
            },
            {
                public_url: 'https://slack.example.test',
                proto: 'https',
                config: {addr: 'http://localhost:8095'},
            },
            {
                public_url: 'https://viber.example.test',
                proto: 'https',
                config: {addr: 'localhost:8096'},
            },
        ],
    };
    t.equal(
        ngrokPublicUrl(tunnels, 8095),
        'https://slack.example.test',
        'the port picks its own tunnel, and https over the http one forwarding the same port',
    );
    t.equal(
        ngrokPublicUrl(tunnels, 8096),
        'https://viber.example.test',
        'a second listener gets its own',
    );
    t.equal(ngrokPublicUrl(tunnels, 8097), undefined, 'a port nobody forwards has no address');
    t.equal(ngrokPublicUrl({tunnels: []}, 8095), undefined, 'nor does an agent with no tunnels');
    t.equal(ngrokPublicUrl(undefined, 8095), undefined, 'nor a missing answer');
    t.equal(
        ngrokPublicUrl(
            {tunnels: [{public_url: 'https://x.example.test/', config: {addr: '8095'}}]},
            8095,
        ),
        'https://x.example.test',
        'a bare port in the agent\u2019s address is enough, and a trailing slash is dropped',
    );
    t.equal(
        ngrokPublicUrl({tunnels: tunnels.tunnels.slice(0, 1)}, 8095),
        'http://old.example.test',
        'an http tunnel is still an answer',
    );
    t.end();
});

test('each account decides which API its calls reach, and where it is published', t => {
    const accounts = {
        demo: {appId: 'A1', clientId: 'T1', url: 'http://127.0.0.1:18085/api/'},
        real: {appId: 'A2', clientId: 'T2'},
    };
    t.equal(
        chatAccountBase(accounts, 'demo', 'https://slack.com/api/'),
        'http://127.0.0.1:18085/api/',
        'a test account posts to the simulator',
    );
    t.equal(
        chatAccountBase(accounts, 'real', 'https://slack.com/api/'),
        'https://slack.com/api/',
        'while an account that names no base uses the port\u2019s',
    );
    t.equal(
        chatAccountBase({}, 'nobody', undefined),
        undefined,
        'and an account nothing matches falls back to whatever the port was given',
    );

    const manifest = {
        settings: {
            interactivity: {
                is_enabled: false,
                request_url: 'https://old.ngrok.app/chat/slack/A1/T1',
            },
            event_subscriptions: {
                request_url: 'https://old.ngrok.app/chat/slack/A1/T1',
                bot_events: ['message.channels'],
            },
        },
    };
    const url = slackRequestUrl(
        '/chat/slack/{appId}/{clientId}/{action?}',
        'https://new.ngrok.app',
        {
            appId: 'A1',
            clientId: 'T1',
        },
    );
    const repointed = slackManifestRepoint(manifest, url);
    t.equal(url, 'https://new.ngrok.app/chat/slack/A1/T1', 'the tunnel address names the account');
    t.equal(
        repointed.settings?.event_subscriptions?.request_url,
        url,
        'the app is told where to post',
    );
    t.equal(repointed.settings?.interactivity?.request_url, url, 'and where a click comes back to');
    t.equal(repointed.settings?.interactivity?.is_enabled, true, 'with interactivity switched on');
    t.same(
        repointed.settings?.event_subscriptions?.bot_events,
        ['message.channels'],
        'and without deciding what the app subscribes to',
    );
    t.equal(
        manifest.settings.interactivity.request_url,
        'https://old.ngrok.app/chat/slack/A1/T1',
        'the manifest Slack sent is left as it was',
    );

    // A start only writes the manifest when writing changes something: the call is rate-limited, and
    // a process restarted on the same hostname would spend that budget repeating itself (`@@D-688`).
    t.equal(
        slackManifestPointsAt(manifest, url),
        false,
        'an app pointed at another hostname is repointed',
    );
    t.equal(
        slackManifestPointsAt(repointed, url),
        true,
        'and one already pointed there is left alone',
    );
    t.equal(
        slackManifestPointsAt(
            {
                settings: {
                    interactivity: {is_enabled: true, request_url: url},
                    event_subscriptions: {request_url: 'https://old.ngrok.app/chat/slack/A1/T1'},
                },
            },
            url,
        ),
        false,
        'half of the app on the old hostname receives nothing, so it is still rewritten',
    );
    t.equal(
        slackManifestPointsAt(
            {
                settings: {
                    interactivity: {is_enabled: false, request_url: url},
                    event_subscriptions: {request_url: url},
                },
            },
            url,
        ),
        false,
        'and a matching address with interactivity switched off is switched on rather than skipped',
    );
    t.end();
});
