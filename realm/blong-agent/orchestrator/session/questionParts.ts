import {library} from '@feasibleone/blong';

/** What a card holds before the platform shortens it. */
const CARD_TITLE = 150;

/** A sentence ends here, and a question usually is one. */
const SENTENCE_END = /[.?!](?=\s|$)/;

/**
 * `agent.question.parts` — a model's question, split into the sentence a card holds and the whole of
 * it.
 *
 * A question written by a model is rarely one sentence: it states the decision, then why the
 * alternatives are worse. A card shortens its title at 150 characters, so sending that whole text
 * produced a question with an ellipsis where the reasoning was (`@@D-864`). The first sentence is
 * what the controls belong to; the full text goes above the card, where nothing shortens it.
 */
export const questionParts = (question: string): {text: string; detail?: string} => {
    const trimmed = question.trim();
    if (trimmed.length <= CARD_TITLE) return {text: trimmed};
    const first = SENTENCE_END.exec(trimmed);
    const sentence = first ? trimmed.slice(0, first.index + 1) : trimmed;
    // A first sentence longer than the card is cut on a word boundary, because a word cut in half
    // reads as a rendering fault rather than as a deliberate abbreviation.
    const text =
        sentence.length <= CARD_TITLE
            ? sentence
            : `${sentence.slice(0, CARD_TITLE - 1).replace(/\s+\S*$/, '')}…`;
    return {text, detail: trimmed};
};

export default library(() => ({questionParts}));
