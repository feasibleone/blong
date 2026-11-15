/**
 * A model's question, split for a card.
 *
 * The card is what a person taps and the message above it is what they read, so the split has to be
 * predictable: the first sentence is the question, and the whole text goes above it. A card shortens
 * its title at 150 characters, which is the limit this reads (`@@D-864`).
 */

import {test} from 'tap';

import {questionParts} from './questionParts.ts';

test('a question a card can hold is sent as it is', t => {
    const parts = questionParts('Which store should the next run write to?');
    t.equal(parts.text, 'Which store should the next run write to?');
    t.equal(parts.detail, undefined, 'nothing is posted above the card');
    t.end();
});

test('a question with its reasoning is split at the first sentence', t => {
    const question =
        'Should the upload route accept a mismatched content type? The blob realm answers 415 ' +
        'today, and the client that sent the request retries three times before it gives up, which ' +
        'fills the log with failures nobody reads.';
    const parts = questionParts(question);
    t.equal(
        parts.text,
        'Should the upload route accept a mismatched content type?',
        'the card holds the question',
    );
    t.equal(parts.detail, question, 'and the whole of it goes above the card');
    t.ok(parts.text.length <= 150, 'the card sentence fits the title it will be');
    t.end();
});

test('a first sentence longer than a card is cut on a word boundary', t => {
    const question = `Should the next run write to the ${'shared '.repeat(30)}store?`;
    const parts = questionParts(question);
    t.ok(parts.text.length <= 150, `kept within the card's title (${parts.text.length})`);
    t.match(parts.text, /…$/, 'and says it was cut');
    t.notMatch(parts.text, /…\s\S/, 'without leaving a stray word after the ellipsis');
    t.equal(parts.detail, question, 'the whole question is above it, so nothing is lost');
    t.end();
});
