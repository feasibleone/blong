import {test} from 'tap';

import {chatAnswerFormat} from './chatAnswerFormat.ts';

/**
 * What a person reads back after answering.
 *
 * The answer itself is machine-shaped — `{value: 'b'}`, `{values: ['unit']}` — so the only thing this
 * has to get right is that the echo speaks the language of the controls: the label where an option
 * has one, the typed text as it was typed, and one line for whichever combination arrived.
 */

const options = [
    {value: 'a', label: 'Alpha'},
    {value: 'b', label: 'Beta'},
    {value: 'unit', label: 'Unit tests'},
    {value: 'lint', label: 'Lint'},
];

test('a choice is echoed with the label the person saw', t => {
    t.equal(
        chatAnswerFormat({promptId: 'p', value: 'b'}, options),
        'Beta',
        'the value is what a caller switches on, and the label is what the channel should say',
    );
    t.equal(
        chatAnswerFormat({promptId: 'p', value: 'gone'}, options),
        'gone',
        'a value with no option behind it — a button from an older question — is shown as it came',
    );
    t.end();
});

test('a typed answer is echoed as it was typed', t => {
    t.equal(
        chatAnswerFormat({promptId: 'p', text: 'v1.2.0-rc.1'}, options),
        'v1.2.0-rc.1',
        'nothing maps a typed answer, because no option names it',
    );
    t.end();
});

test('a form that answers twice is one line', t => {
    t.equal(
        chatAnswerFormat({promptId: 'p', values: ['lint', 'unit']}, options),
        'Lint, Unit tests',
        'checkboxes are read back in the order the form submitted them, labelled',
    );
    t.equal(
        chatAnswerFormat({promptId: 'p', values: ['unit'], text: 'and the e2e one'}, options),
        'Unit tests — and the e2e one',
        'a ticked box and something typed are both said, and told apart',
    );
    t.equal(
        chatAnswerFormat({promptId: 'p', value: 'a', text: 'or maybe this'}, options),
        'Alpha — or maybe this',
        'a radio group and a box answer the same question in one answer',
    );
    t.end();
});

test('an answer with nothing in it says so', t => {
    t.equal(
        chatAnswerFormat({promptId: 'p'}, options),
        '(empty)',
        'a form whose controls are all optional can be submitted empty, which is still an answer',
    );
    t.equal(
        chatAnswerFormat({promptId: 'p', text: ''}, options),
        '(empty)',
        'an empty box is nothing typed, not something typed',
    );
    t.end();
});
