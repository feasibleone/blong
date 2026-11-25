/**
 * The transcript as chat messages (`@@T-814`).
 *
 * The page draws its own sections today, and CopilotKit's `CopilotChatMessageView` is the closest
 * reference for what it should look like — presentational, no provider, a list of messages and an
 * `isRunning`. A migration is a dependency swap rather than a rewrite only if the seam exists first:
 * this module is that seam. It is a pure function of the rows the page already computes, so the
 * question "would this shape hold the transcript" is answered by a unit test rather than by adopting
 * the dependency and finding out.
 *
 * The roles are the reference's: `user` is the ticket, `assistant` is what the model said, and the
 * working out — reasoning and the states a session reports — is `reasoning` and `activity`, which a
 * chat view renders differently from prose because it is not an answer.
 */

import type {ISessionSection, ISessionToolDetail} from './sessionSections.ts';
import type {SessionRow} from './toolGrouping.ts';

export type ChatRole = 'user' | 'assistant' | 'reasoning' | 'activity';

/** One tool call, as a chat view draws it inside the message that asked for it. */
export interface IChatToolCall {
    id: string;
    name: string;
    /** The arguments as text, which is what a card shows when it has nothing better. */
    arguments?: string;
    /** What the call answered, as text. */
    result?: string;
    durationMs?: number;
    done: boolean;
    /** The same call read into its fields, so a card need not parse the JSON (`@@T-824`). */
    detail?: ISessionToolDetail;
}

export interface IChatMessage {
    id: string;
    role: ChatRole;
    content: string;
    /** What an activity calls itself — a state, a question, a warning.
     *
     * A chat view draws it as the activity's label; an `assistant` message has no title because its
     * prose is the whole of it.
     */
    title?: string;
    /** The calls this message asked for, in the order they were made. */
    toolCalls?: IChatToolCall[];
    /** Whether the message is still arriving. */
    pending?: boolean;
}

const callOf = (section: ISessionSection): IChatToolCall => ({
    id: section.toolCallId ?? section.key,
    name: section.title ?? 'tool',
    ...(section.args !== undefined && {arguments: section.args}),
    ...(section.result !== undefined && {result: section.result}),
    ...(section.durationMs !== undefined && {durationMs: section.durationMs}),
    done: section.done,
    ...(section.detail && {detail: section.detail}),
});

/**
 * The messages a chat view is handed.
 *
 * A run of tool calls is one assistant message carrying them, because that is what it was: one turn
 * of the model that asked for several calls. Pass the ticket text to get the opening `user` turn the
 * reference draws from the prompt; without it the list starts where the transcript does.
 */
export const sessionMessagesOf = (
    rows: readonly SessionRow[],
    ticketText?: string,
): IChatMessage[] => {
    const messages: IChatMessage[] = [];
    if (ticketText !== undefined && ticketText !== '')
        messages.push({id: 'user-ticket', role: 'user', content: ticketText});
    for (const row of rows) {
        if (row.kind === 'tools') {
            messages.push({
                id: row.key,
                role: 'assistant',
                content: '',
                toolCalls: row.calls.map(callOf),
                ...(row.done ? {} : {pending: true}),
            });
            continue;
        }
        const section = row.section;
        if (section.kind === 'tool') {
            // A lone call is a message of its own; a group is one message with several (`@@D-1010`).
            messages.push({
                id: section.key,
                role: 'assistant',
                content: '',
                toolCalls: [callOf(section)],
                ...(section.done ? {} : {pending: true}),
            });
            continue;
        }
        messages.push({
            id: section.key,
            role:
                section.kind === 'message'
                    ? 'assistant'
                    : section.kind === 'reasoning'
                      ? 'reasoning'
                      : 'activity',
            content: section.text,
            ...(section.kind === 'note' && section.title !== undefined && {title: section.title}),
            ...(section.done ? {} : {pending: true}),
        });
    }
    return messages;
};
