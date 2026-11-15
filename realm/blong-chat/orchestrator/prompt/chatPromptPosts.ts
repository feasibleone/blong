import {library} from '@feasibleone/blong';
import type {IChatPrompt} from '@feasibleone/blong/types';

/** One message a question posts: a prompt to render, or the words that precede it. */
export interface IChatPromptPost {
    text?: string;
    prompt?: IChatPrompt;
}

/**
 * `chat.prompt.posts` — what a question posts, in the order it posts it.
 *
 * A card is a control, not a document. Its title is the first thing a platform shortens — Slack cuts
 * it at 150 characters — so a question that argues its case in `text` arrives with an ellipsis where
 * the reasoning was, and the person is asked to choose between options they never read the reason
 * for. The explanation therefore goes in `detail` and travels as its own message, posted before the
 * card, while `text` stays the short question the controls sit under (`@@D-864`).
 *
 * The two are returned apart rather than as a list because they fail differently: a card that cannot
 * be posted is a question nobody can answer, and a message above it that cannot be posted is a
 * warning — the controls are still there, and the channel's scrollback is not the answer's business.
 */
export const chatPromptPosts = (
    prompt: IChatPrompt,
): {explanation?: IChatPromptPost; question: IChatPromptPost} => ({
    ...(prompt.detail ? {explanation: {text: prompt.detail}} : {}),
    question: {prompt},
});

export default library(() => ({chatPromptPosts}));
