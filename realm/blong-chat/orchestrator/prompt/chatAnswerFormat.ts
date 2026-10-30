import {library} from '@feasibleone/blong';
import type {IChatAnswer, IChatPromptOption} from '@feasibleone/blong/types';

/**
 * `chat.answer.format` — an answer as the one line a person reads in the channel.
 *
 * The answer is machine-shaped on purpose: a `value` is what a caller switches on, and repeating it
 * (`b`, `unit`) would tell the person who picked "Beta" and "Unit tests" nothing. So the labels win
 * where an option names one, and the typed text is kept as it was typed.
 *
 * It lives in the realm rather than in the contract because the contract package emits CommonJS-style
 * resolution and cannot re-export a value beside its types (`@@F-648`), and because the words are the
 * realm's: a port that had to derive them would carry a formatter for a contract it only displays. The
 * rendered line travels to the ports as `answerText` (`@@D-693`).
 */
export const chatAnswerFormat = (answer: IChatAnswer, options?: IChatPromptOption[]): string => {
    const labels = new Map((options ?? []).map(option => [option.value, option.label]));
    const shown = (value: string): string => labels.get(value) ?? value;
    const parts: string[] = [];
    if (answer.value !== undefined) parts.push(shown(answer.value));
    if (answer.values?.length) parts.push(answer.values.map(shown).join(', '));
    if (answer.text) parts.push(answer.text);
    return parts.length ? parts.join(' — ') : '(empty)';
};

export default library(() => ({chatAnswerFormat}));
