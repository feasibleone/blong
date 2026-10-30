/**
 * chat.ts — the payload contract between a chat platform port and the `chat` realm.
 *
 * One shape per direction, shared by both platforms: a port maps what a platform sent into
 * `IChatInbound` and renders `IChatPrompt` into whatever that platform can display, while the realm
 * decides what a message means and who is waiting for an answer (`@@D-678`). Keeping the shapes here
 * rather than in either package is what lets `blong-gogo` stay free of a dependency on
 * `realm/blong-chat`, and lets the realm compile against the platform it talks to without importing
 * it.
 */

/** The platforms this contract covers. A new platform is a new port, not a new field (`@@D-679`). */
export type ChatPlatform = 'slack' | 'viber';

/**
 * One bot account, as the configuration carries it.
 *
 * The alias is the key of the map, so it is not repeated here. `appId` and `clientId` are what an
 * incoming request names in its path — the UT shape, kept because it is what an existing app
 * configuration already points at (`@@D-677`).
 */
export interface IChatAccount {
    appId?: string;
    clientId?: string;
    /** Slack bot token (`xoxb-…`), used to call the Web API. */
    botToken?: string;
    /** Slack signing secret, used to verify an incoming request. */
    signingSecret?: string;
    /** Viber auth token, used both to call the API and to verify an incoming request. */
    authToken?: string;
    /**
     * The API base this account calls — `https://slack.com/api/` or a simulator's `…/api/`.
     *
     * Per account rather than per port, because one process serves a real workspace and a test
     * account at once, and only the account knows which one a call is for (`@@D-687`).
     */
    url?: string;
    /**
     * The public address this account is reachable at, when a tunnel provides it.
     *
     * Viber is registered with it; Slack's dashboard is re-pointed at it, and both are settings a
     * restart refreshes rather than a deployment step (`@@D-688`).
     */
    ngrokUrl?: string;
    /** The public URL a Viber bot is registered with at `ready`. Defaults to `ngrokUrl` plus the path. */
    webhookUrl?: string;
    /** Slack app configuration token (`xoxe-1-…`), which may re-point the app's own URLs. */
    configToken?: string;
}

/** The accounts a port instance carries, by alias. A map, so a suite and an rc file can both add one. */
export type IChatAccountMap = Record<string, IChatAccount>;

/** What a platform sent, once the port has mapped it. */
export type ChatMessageType = 'text' | 'image' | 'location';

/** A file, picture or location a platform attached. */
export interface IChatAttachment {
    url?: string;
    thumbnail?: string;
    contentType?: string;
    filename?: string;
    title?: string;
    details?: {lat?: number; lon?: number; address?: string; [key: string]: unknown};
}

/** One inbound message or interaction, as the realm sees it. */
export interface IChatInbound {
    /** What arrived: something a person said, an answer, a form request, or a pick not yet submitted. */
    kind: 'message' | 'answer' | 'prompt.form' | 'prompt.pick' | 'event';
    platform: ChatPlatform;
    /** The account alias the port resolved — never the token that proved it. */
    account?: string;
    appId?: string;
    clientId?: string;
    conversationId: string;
    /** The platform's own id for the message, which is what a retry is matched against. */
    messageId?: string;
    /** Seconds since the epoch, as the platforms send it. */
    timestamp?: number;
    sender?: {id?: string; name?: string};
    type?: ChatMessageType;
    text?: string;
    attachments?: IChatAttachment[];
    /** Present on `kind: 'answer'`. */
    answer?: IChatAnswer;
    /** Present on `kind: 'prompt.form'`: the interaction that may open a form. */
    form?: {promptId: string; triggerId?: string};
    /**
     * Present on `kind: 'prompt.pick'`: a control toggled but not yet submitted.
     *
     * An inline question is a radio group or a checkbox list plus a submit, and the platform reports
     * every toggle as its own interaction. What a toggle carries is the element's whole current
     * selection, which is what lets a submit that arrives without one still be answered.
     */
    pick?: {promptId: string; value?: string; values?: string[]};
}

/** The controls a caller can ask for, in the one vocabulary every platform maps from. */
export type ChatPromptKind = 'choice' | 'multiChoice' | 'text' | 'confirm';

/**
 * How a question asks for its answer: in the conversation, or in a form it opens.
 *
 * `inline` is the default and puts the controls in the message itself — radio buttons, checkboxes and
 * a button that submits them — so the person never leaves the conversation. `form` posts one button
 * that opens the platform's own dialog, which is the only surface where some platforms allow a text
 * input at all, and is what a long question with several controls wants. A port renders the one its
 * platform can serve; where a platform has no dialog (Viber), `form` is rendered as the inline
 * controls rather than refused, because the answer is the same either way.
 */
export type ChatPromptPresentation = 'inline' | 'form';

/** One selectable answer. */
export interface IChatPromptOption {
    value: string;
    label: string;
    description?: string;
}

/**
 * A question, as the caller states it.
 *
 * `promptId` is minted by the realm and carried back by the platform — in a button's value on Slack, in
 * a keyboard button's payload on Viber — which is what lets an answer find the call waiting for it
 * without the realm keeping a conversation transcript (`@@D-677`).
 */
export interface IChatPrompt {
    promptId: string;
    kind: ChatPromptKind;
    text: string;
    options?: IChatPromptOption[];
    placeholder?: string;
    /** `inline` unless the caller asks for a form (`@@D-691`). */
    presentation?: ChatPromptPresentation;
}

/** What a person chose, once the port has mapped the interaction back. */
export interface IChatAnswer {
    promptId: string;
    /**
     * Who answered, when the platform said.
     *
     * Part of the answer rather than of the question's bookkeeping because the answer is what gets
     * shown: a settled question says who settled it, and a group conversation needs that more than it
     * needs the value repeated (`@@D-693`). A caller answering from a program has no identity here.
     */
    sender?: {id?: string; name?: string};
    /** A single chosen value — a button, a radio button, a confirmation. */
    value?: string;
    /** Several chosen values — checkboxes. */
    values?: string[];
    /** Free text, as typed. */
    text?: string;
}

/** What a caller asks a platform to post. */
export interface IChatSendParams {
    account?: string;
    conversationId: string;
    text?: string;
    attachments?: IChatAttachment[];
}

/** What a caller asks a platform to render. */
export interface IChatPromptParams {
    account?: string;
    conversationId: string;
    prompt: IChatPrompt;
}

/**
 * What settling an answered question needs: the question as it was asked, what came back, and where
 * the message is.
 *
 * `messageId` is what the send reply named — `ts` on Slack, `message_token` on Viber — and it is
 * optional because a platform may not say. Without it the question is answered but its message cannot
 * be edited, which is the case the caller falls back to a fresh message for (`@@D-692`).
 */
export interface IChatPromptSettleParams extends IChatPromptParams {
    messageId?: string;
    answer: IChatAnswer;
    /**
     * The answer in words, with the labels the person saw rather than the values a caller switches on.
     *
     * Rendered by the caller because only it can: the words come from the question's own vocabulary,
     * and a port that had to derive them would carry a formatter for a contract it only displays
     * (`@@D-693`). A platform whose message has no blocks to mark writes this out instead.
     */
    answerText: string;
}
