import {library} from '@feasibleone/blong';
import type {IChatAnswer, IChatPromptParams} from '@feasibleone/blong/types';

/**
 * The questions waiting for an answer, and the one seam a stateful pass replaces.
 *
 * A map in memory, keyed by platform, account, conversation and prompt, because the first pass keeps
 * no database (`@@D-677`). The three operations are the whole contract a store needs — add, read,
 * take — so a later implementation puts rows behind the same functions and the handlers do not
 * change. A restart forgets what was asked, which is why an ask has a timeout rather than a promise
 * that can hang forever.
 */
export interface IParkedPrompt extends IChatPromptParams {
    /** Part of the key: two platforms may reuse a conversation id, and they are not the same person. */
    platform: 'slack' | 'viber';
}

export interface IPendingPrompt {
    key: string;
    params: IParkedPrompt;
    resolve: (answer: IChatAnswer) => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
    /**
     * What the controls of an inline question currently hold.
     *
     * A radio group or a checkbox list reports every toggle as its own interaction, and the submit
     * that follows may arrive carrying the selection or without one. Keeping the last toggle makes
     * the second case answerable, and a stale pick cannot outlive the question because the entry is
     * consumed when it is answered (`@@D-691`).
     */
    pick?: {value?: string; values?: string[]};
}

/** What identifies a question: the same four parts a button carries back, in one string. */
export const pendingKey = (
    promptId: string,
    where: {platform: string; account?: string; conversationId: string},
): string => [where.platform, where.account ?? '', where.conversationId, promptId].join('|');

const pending = new Map<string, IPendingPrompt>();

export const pendingAdd = (entry: IPendingPrompt): void => {
    pending.set(entry.key, entry);
};

/** Read without consuming — a form request needs the question's controls and leaves the ask waiting. */
export const pendingGet = (key: string): IPendingPrompt | undefined => pending.get(key);

/** Remember what an inline question's controls hold, without settling anything. */
export const pendingPick = (key: string, pick: {value?: string; values?: string[]}): boolean => {
    const entry = pending.get(key);
    if (!entry) return false;
    entry.pick = pick;
    return true;
};

/** Consume: an answer is delivered once, however many times a platform retries the click. */
export const pendingTake = (key: string): IPendingPrompt | undefined => {
    const entry = pending.get(key);
    if (entry) pending.delete(key);
    return entry;
};

/**
 * The question a typed reply answers.
 *
 * A free-text answer carries no prompt id — there is no button to carry it — so it is matched by the
 * conversation, newest first. Only while something is pending does this claim a message.
 */
export const pendingForConversation = (where: {
    platform: string;
    account?: string;
    conversationId: string;
}): IPendingPrompt | undefined => {
    let found: IPendingPrompt | undefined;
    for (const entry of pending.values()) {
        const {platform, account, conversationId} = entry.params;
        if (
            platform === where.platform &&
            (account ?? '') === (where.account ?? '') &&
            conversationId === where.conversationId
        )
            found = entry;
    }
    return found;
};

/** What is waiting, for a local caller that wants to see the state (`chat.prompt.find`). */
export const pendingList = (): IParkedPrompt[] =>
    Array.from(pending.values(), entry => entry.params);

export default library(() => ({
    pendingKey,
    pendingAdd,
    pendingGet,
    pendingPick,
    pendingTake,
    pendingForConversation,
    pendingList,
}));
