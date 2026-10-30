/**
 * chatActions.ts — the identifier a platform carries an answer back in.
 *
 * A button is the only field both platforms let a sender fill freely (Slack's `action_id`, Viber's
 * `ActionBody`), so the question's identity travels there: a person clicking is answering prompt
 * `p` with value `v`, and the port needs nothing else to say so. The realm mints `promptId`, which is
 * what lets an answer find the call waiting for it without a conversation transcript (`@@D-677`).
 *
 * Four forms. A plain answer travels in a button. A form needs an interaction that can open one. An
 * inline form is a radio group or a checkbox list beside a submit button, and Slack reports the two
 * separately: the toggle (`PICK`) carries what is currently selected, the submit (`SUBMIT`) is the
 * person saying they are done (`@@D-691`).
 */
const PROMPT = 'chatPrompt';
const FORM = 'chatPromptForm';
const PICK = 'chatPromptPick';
const SUBMIT = 'chatPromptSubmit';

/** The id a choice, a confirmation or a keyboard button carries. */
export const chatPromptActionId = (promptId: string, value: string): string =>
    `${PROMPT}:${promptId}:${value}`;

/** The id of the button that asks Slack to open the form a multi-choice or free-text question needs. */
export const chatPromptFormActionId = (promptId: string): string => `${FORM}:${promptId}`;

/** The id of the radio group or checkbox list an inline question shows. */
export const chatPromptPickActionId = (promptId: string): string => `${PICK}:${promptId}`;

/** The id of the button that submits an inline question's controls. */
export const chatPromptSubmitActionId = (promptId: string): string => `${SUBMIT}:${promptId}`;

export interface IChatPromptAction {
    promptId: string;
    /** What the person chose — absent on a form request, a toggle and a submit. */
    value?: string;
    /** True when the interaction is a request to open the form rather than an answer. */
    form: boolean;
    /** True when a control of an inline question was toggled. */
    pick?: boolean;
    /** True when an inline question's submit was pressed. */
    submit?: boolean;
}

/**
 * Read an id back.
 *
 * A value may itself contain a colon (`v1:2`, a URL), so only the first two separators are
 * structural; everything after the second is the value as it was given. An id that is not one of
 * ours answers `undefined`, which is how a port tells its own controls from a button somebody else
 * added to the same app.
 */
export const chatPromptActionParse = (actionId: string): IChatPromptAction | undefined => {
    const [prefix, promptId, ...rest] = actionId.split(':');
    if (!promptId) return undefined;
    if (prefix === FORM) return {promptId, form: true};
    if (prefix === PICK) return {promptId, form: false, pick: true};
    if (prefix === SUBMIT) return {promptId, form: false, submit: true};
    if (prefix === PROMPT) return {promptId, form: false, value: rest.join(':')};
    return undefined;
};
