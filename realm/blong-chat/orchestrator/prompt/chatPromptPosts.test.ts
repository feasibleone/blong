/**
 * What a question posts, in order.
 *
 * The reason this is a function rather than two statements in the orchestrator: the order is the fix.
 * A card shortens the question it holds, so the explanation has to be a message of its own that
 * arrives first — and a test that reads the order is the only way to notice it moving.
 */

import {test} from 'tap';

import {chatPromptPosts} from './chatPromptPosts.ts';

test('a question with an explanation posts it as a message above the card', t => {
    const posts = chatPromptPosts({
        promptId: 'p1',
        kind: 'choice',
        text: 'Which store should the next run write to?',
        detail: 'The blob store is a configuration value now, so the run has to say which one it uses.',
    });
    t.equal(
        posts.explanation?.text,
        'The blob store is a configuration value now, so the run has to say which one it uses.',
        'the reasoning is the first message',
    );
    t.equal(
        posts.question.prompt?.text,
        'Which store should the next run write to?',
        'and the card carries the short question',
    );
    t.equal(posts.question.text, undefined, 'the card is a prompt, not a second copy of the words');
    t.end();
});

test('a question with no explanation posts only the card', t => {
    const posts = chatPromptPosts({promptId: 'p2', kind: 'confirm', text: 'Close the plan?'});
    t.equal(posts.explanation, undefined, 'nothing is posted above it');
    t.equal(posts.question.prompt?.promptId, 'p2');
    t.end();
});
