import type {IChatPrompt} from '@feasibleone/blong/types';
import {library} from '@feasibleone/blong/types';

import {chatPromptActionId} from '../../../chatActions.ts';

/**
 * The keyboard a canonical prompt becomes.
 *
 * Viber's richest interactive element is a keyboard of reply buttons: the button's `ActionBody` comes
 * back as the text of the next message, which is what lets an answer identify its question. There is
 * no checkbox and no form, so a multiple choice has no rendering here and the caller is told so
 * (`@@D-678`).
 */
const truncate = (value: string, max: number): string =>
    value.length <= max ? value : value.slice(0, max - 1) + '…';

export interface IViberButton {
    Columns: number;
    Rows: number;
    Text: string;
    ActionType: 'reply';
    ActionBody: string;
}

export interface IViberKeyboard {
    Type: 'keyboard';
    DefaultHeight: boolean;
    Buttons: IViberButton[];
}

/** The buttons a choice or a confirmation is answered with. */
export const viberPromptButtons = (prompt: IChatPrompt): IViberButton[] => {
    const options =
        prompt.kind === 'confirm'
            ? [
                  {value: 'yes', label: 'Yes'},
                  {value: 'no', label: 'No'},
              ]
            : (prompt.options ?? []);
    return options.map(option => ({
        Columns: 6,
        Rows: 1,
        Text: truncate(option.label, 30),
        ActionType: 'reply',
        ActionBody: chatPromptActionId(prompt.promptId, option.value),
    }));
};

/** The keyboard a message carries, or nothing when the question is answered by typing. */
export const viberPromptKeyboard = (prompt: IChatPrompt): IViberKeyboard | undefined =>
    prompt.kind === 'choice' || prompt.kind === 'confirm'
        ? {Type: 'keyboard', DefaultHeight: false, Buttons: viberPromptButtons(prompt)}
        : undefined;

export default library(() => ({viberPromptButtons, viberPromptKeyboard}));
