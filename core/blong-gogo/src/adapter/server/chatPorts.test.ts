import {createHmac} from 'node:crypto';

import type {IChatPrompt} from '@feasibleone/blong/types';
import {test} from 'tap';

import {
    chatAccountBase,
    chatAccountFind,
    chatAccountName,
    chatAccountsFromDispatch,
    chatPublicUrl,
} from '../../chatAccounts.ts';
import {
    chatPromptActionId,
    chatPromptActionParse,
    chatPromptFormActionId,
    chatPromptPickActionId,
    chatPromptSubmitActionId,
} from '../../chatActions.ts';
import {ngrokPublicUrl} from '../impl/ngrokTunnels.ts';
import {
    slackAppPatch,
    slackManifestDraft,
    slackRotationPatch,
    slackTokenExpiring,
    slackTokenExpiry,
} from '../impl/slackConfigToken.ts';
import {
    slackManifestPointsAt,
    slackManifestRepoint,
    slackRequestUrl,
} from '../impl/slackManifest.ts';
import {slackAcknowledgeGet} from './slack/acknowledge.ts';
import {
    slackPresentation,
    slackPromptAnsweredBlocks,
    slackPromptBlocks,
    slackPromptExpiredBlocks,
    slackPromptView,
} from './slack/blocks.ts';
import {slackSignatureMatches} from './slack/signature.ts';
import {viberPromptButtons, viberPromptKeyboard} from './viber/keyboard.ts';
import {viberSignatureMatches} from './viber/signature.ts';

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
    // Inline is the plainest surface: the options are the message, not a card and not a dialog.
    const choice = slackPromptBlocks(prompt({presentation: 'inline'})) as Block[];
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

    const multi = slackPromptBlocks(
        prompt({kind: 'multiChoice', presentation: 'inline'}),
    ) as Block[];
    t.equal(multi[1]?.elements?.[0]?.type, 'checkboxes', 'a multiple choice is checkboxes inline');

    const typed = slackPromptBlocks(
        prompt({kind: 'text', options: undefined, placeholder: 'v1', presentation: 'inline'}),
    );
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

test('an expired question keeps its text and loses its controls', t => {
    type Block = {type?: string; elements?: Array<{text?: string}>; text?: {text?: string}};
    const notice = '_No answer within 5 minutes — the question is closed._';
    const blocks = slackPromptExpiredBlocks(prompt({}), notice) as Block[];
    t.same(
        blocks.map(block => block.type),
        ['section', 'section', 'context'],
        'the question, its options and why it closed',
    );
    t.equal(
        blocks[1]?.text?.text,
        '• Alpha\n• Beta',
        'the options stay readable, with nothing marked because nothing was picked',
    );
    t.equal(blocks[2]?.elements?.[0]?.text, notice, 'and the line says what the caller waited for');
    t.equal(
        /actions|radio_buttons|checkboxes|plain_text_input|button/.test(JSON.stringify(blocks)),
        false,
        'with nothing left to press, which is the whole point of closing it',
    );

    const noOptions = slackPromptExpiredBlocks(
        prompt({kind: 'text', options: undefined}),
        notice,
    ) as Block[];
    t.equal(noOptions.length, 2, 'a free-text question has no options to keep');
    t.equal(noOptions[1]?.elements?.[0]?.text, notice, 'so it keeps only the reason it closed');
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
    const inline = slackPromptBlocks(
        prompt({presentation: 'inline', placeholder: 'Other'}),
    ) as Array<{
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

test('a question is a card in the message unless it says otherwise', t => {
    t.equal(slackPresentation(prompt({})), 'inlineForm', 'a choice is a card by default');
    t.equal(slackPresentation(prompt({kind: 'multiChoice'})), 'inlineForm');
    t.equal(
        slackPresentation(prompt({kind: 'text', options: undefined})),
        'inlineForm',
        'so is a question that only wants typing',
    );
    t.equal(
        slackPresentation(prompt({kind: 'confirm', options: undefined})),
        'inline',
        'a confirmation is two buttons, which need no card around them',
    );
    t.equal(
        slackPresentation(prompt({presentation: 'form'})),
        'form',
        'and a named presentation always wins',
    );

    const blocks = slackPromptBlocks(prompt({})) as Array<{
        type?: string;
        child_blocks?: unknown[];
    }>;
    t.equal(blocks.length, 1, 'the default posts one block');
    t.equal(blocks[0]?.type, 'container');
    t.ok(
        (blocks[0]?.child_blocks?.length ?? 99) <= 10,
        'and it stays inside the ten child blocks the platform allows',
    );
    t.end();
});

test('a question is a card in the message unless it says otherwise', t => {
    t.equal(slackPresentation(prompt({})), 'inlineForm', 'a choice is a card by default');
    t.equal(slackPresentation(prompt({kind: 'multiChoice'})), 'inlineForm');
    t.equal(
        slackPresentation(prompt({kind: 'text', options: undefined})),
        'inlineForm',
        'so is a question that only wants typing',
    );
    t.equal(
        slackPresentation(prompt({kind: 'confirm', options: undefined})),
        'inline',
        'a confirmation is two buttons, which need no card around them',
    );
    t.equal(
        slackPresentation(prompt({presentation: 'form'})),
        'form',
        'and a named presentation always wins',
    );

    const blocks = slackPromptBlocks(prompt({})) as Array<{
        type?: string;
        child_blocks?: unknown[];
    }>;
    t.equal(blocks.length, 1, 'the default posts one block');
    t.equal(blocks[0]?.type, 'container');
    t.ok(
        (blocks[0]?.child_blocks?.length ?? 99) <= 10,
        'and it stays inside the ten child blocks the platform allows',
    );
    t.end();
});

test('an inline form is one container the person fills in the message', t => {
    type Child = {type?: string; block_id?: string; element?: {type?: string}};
    type Card = {
        type?: string;
        title?: {text?: string};
        subtitle?: {text?: string};
        child_blocks?: Child[];
    };

    const blocks = slackPromptBlocks(
        prompt({presentation: 'inlineForm', placeholder: 'Other'}),
    ) as Card[];
    t.equal(
        blocks.length,
        1,
        'the whole question is one message block, not a button that opens a dialog',
    );
    t.equal(blocks[0]?.type, 'container', 'a data-entry card');
    t.equal(blocks[0]?.title?.text, 'Which one?', 'the question is the card’s title');
    t.equal(
        blocks[0]?.subtitle?.text,
        'Other',
        'and what the caller said about typing is its subtitle',
    );

    const children = blocks[0]?.child_blocks ?? [];
    t.same(
        children.map(child => child.block_id),
        ['choice', 'text', 'submit'],
        'a radio group, a box for something else, and the submit',
    );
    t.same(
        children.map(child => child.element?.type ?? child.type),
        ['radio_buttons', 'plain_text_input', 'actions'],
        'the two inputs are the controls the answer is read from',
    );
    t.same(
        (
            children[2] as unknown as {elements?: Array<{action_id?: string}>} | undefined
        )?.elements?.map(element => element.action_id),
        [chatPromptSubmitActionId('p1')],
        'and the submit names the question it settles',
    );

    const multi = slackPromptBlocks(
        prompt({kind: 'multiChoice', presentation: 'inlineForm', placeholder: 'Other'}),
    ) as Card[];
    t.equal(
        multi[0]?.child_blocks?.[0]?.element?.type,
        'checkboxes',
        'a multiple choice fills the same card, with checkboxes',
    );

    const typed = slackPromptBlocks(prompt({kind: 'text', presentation: 'inlineForm'})) as Card[];
    t.same(
        typed[0]?.child_blocks?.map(child => child.block_id),
        ['text', 'submit'],
        'a free-text question is one box and the submit',
    );
    t.end();
});

test('a list longer than a control holds is a dropdown, in the card and in the dialog', t => {
    type Child = {
        element?: {type?: string; options?: Array<{value?: string; text?: {type?: string}}>};
    };
    type Card = {type?: string; child_blocks?: Child[]};
    const eleven = Array.from({length: 11}, (_all, index) => ({
        value: `n${index + 1}`,
        label: `N${index + 1}`,
    }));

    const card = slackPromptBlocks(
        prompt({presentation: 'inlineForm', options: eleven, placeholder: 'Other'}),
    ) as Card[];
    t.equal(card[0]?.type, 'container', 'the question is still the card it would have been');
    t.equal(
        card[0]?.child_blocks?.[0]?.element?.type,
        'static_select',
        'with a dropdown instead of one radio group Slack would refuse',
    );
    t.equal(
        card[0]?.child_blocks?.[0]?.element?.options?.length,
        11,
        'holding every option the caller listed',
    );
    t.equal(
        card[0]?.child_blocks?.[0]?.element?.options?.[0]?.text?.type,
        'plain_text',
        'labelled in the one shape a select accepts — markdown in an option is refused',
    );

    const view = slackPromptView(prompt({options: eleven, placeholder: 'Other'}), 'D1') as {
        blocks?: Child[];
    };
    t.equal(
        view.blocks?.[1]?.element?.type,
        'static_select',
        'and the dialog asks the same way, so the drop-down is one field either way',
    );

    const multi = slackPromptBlocks(
        prompt({kind: 'multiChoice', presentation: 'inlineForm', options: eleven}),
    ) as Card[];
    t.equal(
        multi[0]?.child_blocks?.[0]?.element?.type,
        'multi_static_select',
        'a multiple choice of that length takes several values from a dropdown',
    );

    const pick = slackPromptBlocks(prompt({presentation: 'inline', options: eleven})) as Array<{
        block_id?: string;
        elements?: Array<{type?: string}>;
    }>;
    t.equal(
        pick.find(block => block.block_id === 'pick')?.elements?.[0]?.type,
        'static_select',
        'and the plain inline question cannot post eleven radios either',
    );
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
        ['message.channels', 'message.groups', 'message.im'],
        'and subscribing the message events it reads, which is what makes a private channel answer',
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
        'and one already pointed there, with every message event, is left alone',
    );
    t.equal(
        slackManifestPointsAt(
            {
                settings: {
                    interactivity: {is_enabled: true, request_url: url},
                    event_subscriptions: {request_url: url, bot_events: ['message.channels']},
                },
            },
            url,
        ),
        false,
        'an app addressed right but deaf to private channels is rewritten too',
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

test('a configuration token is renewed before it dies, and only when its expiry is known', t => {
    const now = 1_800_000_000;
    t.equal(slackTokenExpiry(now), now, 'seconds since the epoch are read as they are');
    t.equal(
        slackTokenExpiry(new Date(now * 1000).toISOString()),
        now,
        'a timestamp column is turned into the same seconds',
    );
    t.equal(slackTokenExpiry(undefined), undefined, 'an absent expiry is unknown');
    t.equal(slackTokenExpiry('not a date'), undefined, 'and an unreadable one is unknown too');
    t.equal(
        slackTokenExpiring(now + 60, now),
        true,
        'a token inside the skew is renewed now rather than on the call that needed it',
    );
    t.equal(slackTokenExpiring(now + 3600, now), false, 'one with an hour left is left alone');
    t.equal(
        slackTokenExpiring(undefined, now),
        false,
        'an unknown expiry is never due: rotating it on every start would spend a pair each time',
    );
    t.same(
        slackRotationPatch({ok: false, error: 'invalid_refresh_token'}),
        {},
        'a refused rotation produces no fields to store',
    );
    t.same(
        slackRotationPatch({
            ok: true,
            token: 'xoxe.xoxp-1-new',
            refresh_token: 'xoxe-1-new',
            exp: now,
        }),
        {
            configToken: 'xoxe.xoxp-1-new',
            configRefreshToken: 'xoxe-1-new',
            configTokenExpiresAt: now,
        },
        'the pair and its expiry travel together, because the old refresh token is spent',
    );
    t.end();
});

test('an app is created bare and read back with the ids Slack gave it', t => {
    const manifest = slackManifestDraft('blong-bot') as {
        display_information: {name: string};
        features: {bot_user: {display_name: string}};
        oauth_config: {scopes: {bot: string[]}};
        settings: Record<string, unknown>;
    };
    t.equal(manifest.display_information.name, 'blong-bot', 'the app takes the alias as its name');
    t.equal(manifest.features.bot_user.display_name, 'blong-bot', 'and so does the bot user');
    t.ok(manifest.oauth_config.scopes.bot.includes('chat:write'), 'it may post');
    t.ok(
        manifest.oauth_config.scopes.bot.includes('channels:manage') &&
            manifest.oauth_config.scopes.bot.includes('groups:write'),
        'and may open a channel of its own, because a plan asks for one',
    );
    t.notOk(
        'event_subscriptions' in manifest.settings,
        'no request URL is named before Slack has answered the ids the address carries',
    );
    t.same(
        slackAppPatch({
            app_id: 'A9',
            credentials: {client_id: 'C9', signing_secret: 's9', client_secret: 'secret'},
        }),
        {appId: 'A9', clientId: 'C9', signingSecret: 's9'},
        'the ids and the signing secret are what the inbound half needs',
    );
    t.same(
        slackAppPatch({credentials: {client_id: 'C9'}}),
        {clientId: 'C9'},
        'a partial answer keeps what it has',
    );
    t.end();
});

test('a realm answers the account map a port runs with', t => {
    const accounts = {demo: {appId: 'A1', clientId: 'T1'}};
    t.same(
        chatAccountsFromDispatch({accounts}),
        accounts,
        'the map the store answered is the map the port uses',
    );
    t.same(
        chatAccountsFromDispatch([{accounts}]),
        accounts,
        'a transport that wraps the answer in a list is read the same way',
    );
    t.equal(
        chatAccountsFromDispatch({accounts: {}}),
        undefined,
        'an empty store falls back to the configured accounts instead of erasing them',
    );
    t.equal(
        chatAccountsFromDispatch(undefined),
        undefined,
        'and so does a store that answered nothing',
    );
    t.equal(chatAccountsFromDispatch({accounts: []}), undefined, 'a list is not a map');
    t.end();
});
