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

/**
 * The keys a question may be filed under, when looking one up from an inbound.
 *
 * A question asked **without** naming an account is filed under none, because its caller does not
 * know which account serves the conversation: `blong-dev` asks from a shell, and a realm asking its
 * own channel names a conversation and nothing else. Every inbound carries the account that verified
 * it (`identity.account` in the Slack port), so an exact-only lookup missed *every* time — the ask
 * waited for its timeout while the click was acknowledged as a question nobody was waiting for, and a
 * typed reply fell through to the consumer map and was dropped as a message nobody configured one
 * for. What an account a parked question did not name therefore matches any, and one it did name must
 * match exactly: naming an account is a caller saying *which* account it means, and ignoring that
 * would let a question in one workspace be answered from another.
 */
export const pendingKeys = (
    promptId: string,
    where: {platform: string; account?: string; conversationId: string},
): string[] => {
    const exact = pendingKey(promptId, where);
    const unnamed = pendingKey(promptId, {...where, account: ''});
    return exact === unnamed ? [exact] : [exact, unnamed];
};

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

/** The entry an inbound names, tried under each key it may have been filed under. */
const findMatching = (
    promptId: string,
    where: {platform: string; account?: string; conversationId: string},
): {key: string; entry: IPendingPrompt} | undefined => {
    for (const key of pendingKeys(promptId, where)) {
        const entry = pending.get(key);
        if (entry) return {key, entry};
    }
    return undefined;
};

/** Read a question by the id an inbound carries, whether or not it named an account. */
export const pendingGetMatching = (
    promptId: string,
    where: {platform: string; account?: string; conversationId: string},
): IPendingPrompt | undefined => findMatching(promptId, where)?.entry;

/** Remember a pick against the question an inbound names, however it was filed. */
export const pendingPickMatching = (
    promptId: string,
    where: {platform: string; account?: string; conversationId: string},
    pick: {value?: string; values?: string[]},
): boolean => {
    const found = findMatching(promptId, where);
    if (!found) return false;
    found.entry.pick = pick;
    return true;
};

/** Consume the question an inbound answers, whether or not it named an account. */
export const pendingTakeMatching = (
    promptId: string,
    where: {platform: string; account?: string; conversationId: string},
): IPendingPrompt | undefined => {
    const found = findMatching(promptId, where);
    if (!found) return undefined;
    pending.delete(found.key);
    return found.entry;
};

/**
 * The question a typed reply answers.
 *
 * A free-text answer carries no prompt id — there is no button to carry it — so it is matched by the
 * conversation, newest first. Only while something is pending does this claim a message.
 *
 * A question that named no account is a candidate here whatever account the message arrived on, for
 * the reason {@link pendingKeys} gives: an unnamed account is a caller that could not know it, not a
 * caller that meant a different one.
 */
export const pendingForConversation = (where: {
    platform: string;
    account?: string;
    conversationId: string;
}): IPendingPrompt | undefined => {
    let found: IPendingPrompt | undefined;
    for (const entry of pending.values()) {
        const {platform, account, conversationId} = entry.params;
        const anyAccount = (account ?? '') === '';
        if (
            platform === where.platform &&
            (anyAccount || (account ?? '') === (where.account ?? '')) &&
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
    pendingKeys,
    pendingAdd,
    pendingGet,
    pendingGetMatching,
    pendingPick,
    pendingPickMatching,
    pendingTake,
    pendingTakeMatching,
    pendingForConversation,
    pendingList,
}));
