import type {IChatAnswer, IChatPrompt, IChatPromptOption} from '@feasibleone/blong/types';
import {library} from '@feasibleone/blong/types';

import {
    chatPromptActionId,
    chatPromptFormActionId,
    chatPromptPickActionId,
    chatPromptSubmitActionId,
} from '../../../chatActions.ts';

/**
 * The Block Kit a canonical prompt becomes.
 *
 * `inline` — the default — puts the controls in the message: radio buttons or checkboxes in an
 * `actions` block and a submit button under them, plus a line telling the person they may reply
 * instead where the question allows something typed (`@@D-691`). Slack has no text input in a
 * message, so that alternative is the conversation itself: a pending question claims the next reply.
 *
 * `form` posts one button that opens a modal, which is the only place Slack renders a text input and
 * a radio group side by side. A choice with a `placeholder` is what wants one — the editor's question
 * tool offers options *and* a box to type something else — and a multiple choice gets the text input
 * beside its checkboxes there. Both presentations answer the same ask.
 *
 * Pure, because this is the assertion that the controls the requester asked for exist: a test reads
 * these blocks and the view below without a Slack workspace to look at.
 */
const truncate = (value: string, max: number): string =>
    value.length <= max ? value : value.slice(0, max - 1) + '…';

const button = (label: string, actionId: string, value?: string, style?: 'primary' | 'danger') => ({
    type: 'button',
    ...(style && {style}),
    text: {type: 'plain_text', text: truncate(label, 75)},
    action_id: actionId,
    ...(value !== undefined && {value}),
});

/** The one button that asks Slack for the form, because a modal opens from an interaction. */
const formButton = (prompt: IChatPrompt, label: string) => ({
    type: 'actions',
    elements: [button(label, chatPromptFormActionId(prompt.promptId), prompt.promptId)],
});

/** What a person can pick, in the shape both `checkboxes` and `radio_buttons` take. */
const choices = (options: IChatPromptOption[] | undefined) =>
    (options ?? []).map(option => ({
        text: {type: 'mrkdwn' as const, text: option.label},
        value: option.value,
    }));

/** The line that offers the typed alternative a message cannot show as a field. */
const replyHint = (hint: string): unknown => ({
    type: 'context',
    elements: [{type: 'mrkdwn', text: hint}],
});

/**
 * The question with its controls in the message: options first, then what submits them.
 *
 * The block ids are the contract with the submit — `pick` holds the element whose selection is the
 * answer — because a `block_actions` payload reports the state of the message keyed by block.
 */
const inlineBlocks = (prompt: IChatPrompt): unknown[] => {
    const blocks: unknown[] = [{type: 'section', text: {type: 'mrkdwn', text: prompt.text}}];
    if (prompt.kind === 'confirm') {
        // A confirmation is two buttons and nothing else: there is no selection to submit.
        blocks.push({
            type: 'actions',
            elements: [
                button('Yes', chatPromptActionId(prompt.promptId, 'yes'), 'yes', 'primary'),
                button('No', chatPromptActionId(prompt.promptId, 'no'), 'no', 'danger'),
            ],
        });
        return blocks;
    }
    if (prompt.kind === 'choice' || prompt.kind === 'multiChoice') {
        blocks.push({
            type: 'actions',
            block_id: 'pick',
            elements: [
                {
                    type: prompt.kind === 'choice' ? 'radio_buttons' : 'checkboxes',
                    action_id: chatPromptPickActionId(prompt.promptId),
                    options: choices(prompt.options),
                },
            ],
        });
        blocks.push({
            type: 'actions',
            block_id: 'submit',
            elements: [
                button(
                    'Submit',
                    chatPromptSubmitActionId(prompt.promptId),
                    prompt.promptId,
                    'primary',
                ),
            ],
        });
    }
    if (prompt.placeholder) blocks.push(replyHint(`or reply here: ${prompt.placeholder}`));
    else if (prompt.kind === 'text') blocks.push(replyHint('Reply here with your answer.'));
    return blocks;
};

/** The message a prompt is posted as, in the presentation the question asked for. */
export const slackPromptBlocks = (prompt: IChatPrompt): unknown[] => {
    const section = {type: 'section', text: {type: 'mrkdwn', text: prompt.text}};
    if ((prompt.presentation ?? 'inline') === 'inline') return inlineBlocks(prompt);
    switch (prompt.kind) {
        case 'choice':
            // A placeholder asks for a typed alternative too, and a message cannot carry one.
            if (prompt.placeholder) return [section, formButton(prompt, 'Choose')];
            return [
                section,
                {
                    type: 'actions',
                    elements: (prompt.options ?? []).map(option =>
                        button(
                            option.label,
                            chatPromptActionId(prompt.promptId, option.value),
                            option.value,
                        ),
                    ),
                },
            ];
        case 'confirm':
            return [
                section,
                {
                    type: 'actions',
                    elements: [
                        button('Yes', chatPromptActionId(prompt.promptId, 'yes'), 'yes', 'primary'),
                        button('No', chatPromptActionId(prompt.promptId, 'no'), 'no', 'danger'),
                    ],
                },
            ];
        default:
            // `multiChoice` and `text` cannot live in a message; the message is the door to the form.
            return [section, formButton(prompt, prompt.kind === 'text' ? 'Answer' : 'Choose')];
    }
};

/**
 * The question as it reads once it has been answered: the options still there, the chosen ones marked.
 *
 * A control is only useful while it can be used, so the answered message keeps what the question was
 * and what it got and drops everything interactive — an inline question that still shows a live submit
 * invites a click that can no longer do anything (`@@D-692`). The labels are kept because `Beta` is
 * what the person picked and `b` is what a caller switches on.
 */
export const slackPromptAnsweredBlocks = (
    prompt: IChatPrompt,
    answer: IChatAnswer,
    answerText: string,
): unknown[] => {
    const options = prompt.options ?? [];
    const chosen = new Set<string>([
        ...(answer.value !== undefined ? [answer.value] : []),
        ...(answer.values ?? []),
    ]);
    const typed = answer.text?.trim();
    const blocks: unknown[] = [{type: 'section', text: {type: 'mrkdwn', text: prompt.text}}];
    if (options.length)
        blocks.push({
            type: 'section',
            text: {
                type: 'mrkdwn',
                text: options
                    .map(option => `${chosen.has(option.value) ? '✅' : '•'} ${option.label}`)
                    .join('\n'),
            },
        });
    blocks.push({
        type: 'context',
        elements: [
            {
                type: 'mrkdwn',
                text: settledLine(prompt, answer, options.length > 0, typed, answerText),
            },
        ],
    });
    return blocks;
};

/**
 * What the settled message says under the options.
 *
 * A marked option already says what was picked, so the line says *who* — `🗨️ <@U1>` renders as that
 * person's avatar and name, which is the one thing the marks cannot show (`@@D-693`). Something typed
 * is still named, because no mark can carry it, and an answer to a question with no options (a
 * confirmation, a free-text answer) has to be named too.
 *
 * A question answered by a program has no identity, and then the line falls back to the answer itself
 * rather than to an empty greeting.
 */
const settledLine = (
    prompt: IChatPrompt,
    answer: IChatAnswer,
    hasOptions: boolean,
    typed: string | undefined,
    answerText: string,
): string => {
    const who = answer.sender?.id ? `<@${answer.sender.id}>` : answer.sender?.name;
    // A confirmation has no option to mark, and `Yes` reads better than the value a caller switches on.
    const named =
        prompt.kind === 'confirm' && answer.value !== undefined
            ? answer.value === 'yes'
                ? 'Yes'
                : 'No'
            : undefined;
    const detail = typed ?? (hasOptions ? undefined : (named ?? answerText));
    // No identity to name, so the line says the answer: a program that answered has no avatar, and
    // an empty greeting would tell a reader nothing.
    if (!who) return `_Answer:_ ${answerText || '(empty)'}`;
    return `🗨️ ${who} answered${detail ? `: ${detail}` : ''}`;
};

/** One modal input block: the control, its label and whether an empty answer is allowed. */
const inputBlock = (
    blockId: string,
    label: string,
    element: Record<string, unknown>,
    optional: boolean,
) => ({
    type: 'input',
    block_id: blockId,
    label: {type: 'plain_text', text: truncate(label, 2000)},
    element,
    optional,
});

/**
 * The modal a multiple choice, a free-text question or a choice-with-an-alternative is answered in.
 *
 * The block ids are the answer's fields: `choice` (a radio button), `values` (checkboxes) and `text`
 * (what was typed), so `slackIn.message` reads the submission without knowing which question it was.
 * An input is required unless another input of the same view could answer instead — an empty
 * submission would otherwise settle a question with nothing.
 */
export const slackPromptView = (prompt: IChatPrompt, conversationId: string): unknown => {
    const question = {type: 'section', text: {type: 'mrkdwn', text: prompt.text}};
    const label = truncate(
        prompt.placeholder ?? (prompt.kind === 'text' ? 'Your answer' : 'Choose'),
        2000,
    );
    // A placeholder is the caller asking to accept something typed as well as what it listed.
    const freeText = Boolean(prompt.placeholder) || prompt.kind === 'text';
    const blocks: unknown[] = [question];
    if (prompt.kind === 'choice')
        blocks.push(
            inputBlock(
                'choice',
                label,
                {type: 'radio_buttons', action_id: 'value', options: choices(prompt.options)},
                freeText,
            ),
        );
    if (prompt.kind === 'multiChoice')
        blocks.push(
            inputBlock(
                'values',
                label,
                {type: 'checkboxes', action_id: 'value', options: choices(prompt.options)},
                freeText,
            ),
        );
    if (freeText)
        blocks.push(
            inputBlock(
                'text',
                prompt.kind === 'text' ? label : 'Something else',
                {
                    type: 'plain_text_input',
                    action_id: 'value',
                    multiline: true,
                    ...(prompt.placeholder && {
                        placeholder: {type: 'plain_text', text: truncate(prompt.placeholder, 150)},
                    }),
                },
                prompt.kind !== 'text',
            ),
        );
    return {
        type: 'modal',
        callback_id: 'chatPromptForm',
        // The submission carries no other place for the question's identity.
        private_metadata: JSON.stringify({promptId: prompt.promptId, conversationId}),
        title: {
            type: 'plain_text',
            text: truncate(prompt.kind === 'text' ? 'Your answer' : 'Choose', 24),
        },
        submit: {type: 'plain_text', text: 'Submit'},
        close: {type: 'plain_text', text: 'Cancel'},
        blocks,
    };
};

export default library(() => ({slackPromptBlocks, slackPromptView, slackPromptAnsweredBlocks}));
