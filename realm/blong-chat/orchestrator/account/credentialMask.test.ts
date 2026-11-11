import {test} from 'tap';

import {
    CREDENTIAL_MASK,
    credentialPageMasked,
    credentialPatchUnmasked,
    credentialRowMasked,
    dispatchedValue,
} from './credentialMask.ts';

/**
 * What a list says about a credential, and what a write may leave alone (`@@T-625`).
 *
 * The two shapes the generic route answers with are both read here, because a masking step that
 * silently misses one shape is a list of live tokens that looks correct.
 */
const fields = ['botToken', 'signingSecret'] as const;

test('a row says a credential is configured without saying what it is', t => {
    t.same(
        credentialRowMasked({accountAlias: 'a', botToken: 'xoxb-1', signingSecret: 'shh'}, fields),
        {accountAlias: 'a', botToken: CREDENTIAL_MASK, signingSecret: CREDENTIAL_MASK},
        'every named column is replaced and the rest of the row is untouched',
    );
    t.same(
        credentialRowMasked({botToken: null, signingSecret: ''}, fields),
        {botToken: null, signingSecret: ''},
        'a column holding nothing is not a secret, so it is not dressed as one',
    );
    t.same(
        credentialRowMasked({authToken: 'viber-token'}, fields),
        {authToken: 'viber-token'},
        'a column this object does not owe the mask keeps its value',
    );
    t.end();
});

test('a page is masked in whichever shape the route answered', t => {
    t.same(
        credentialPageMasked(
            {items: [{botToken: 'xoxb-1'}], pagination: {recordsTotal: 1}},
            fields,
        ),
        {
            items: [{botToken: CREDENTIAL_MASK}],
            pagination: {recordsTotal: 1},
        },
        'the page with its total keeps the total',
    );
    t.same(
        credentialPageMasked([{signingSecret: 'shh'}], fields),
        [{signingSecret: CREDENTIAL_MASK}],
        'a bare page — what a caller that did not ask for a count reads — is masked too',
    );
    t.same(
        credentialPageMasked(undefined, fields),
        undefined,
        'and an answer that is nothing stays nothing rather than becoming an empty page',
    );
    t.same(
        credentialPageMasked({recordsTotal: 0}, fields),
        {recordsTotal: 0},
        'a result with no items is handed back as it came, because it is not a page it can see',
    );
    t.same(
        credentialPageMasked({items: [null, 'x']}, fields),
        {items: [null, 'x']},
        'a row that is not an object is left alone instead of being guessed at',
    );
    t.end();
});

test('a save that echoed the mask back is stripped of it', t => {
    t.same(
        credentialPatchUnmasked(
            {accountAlias: 'a', botToken: CREDENTIAL_MASK, signingSecret: 'fresh'},
            fields,
        ),
        {accountAlias: 'a', signingSecret: 'fresh'},
        'the mask is dropped and what the person actually typed is kept',
    );
    t.same(
        credentialPatchUnmasked({botToken: null}, fields),
        {botToken: null},
        'a cleared column is a decision, not a mask, and is written',
    );
    t.end();
});

test('a dispatch answer separates its value from the flow trailer', t => {
    const trailer = {opcode: 'find', forward: {}};
    t.same(
        dispatchedValue([[{a: 1}], trailer]),
        [{a: 1}],
        'a bare page arrives with the trailer beside it and is read as the page',
    );
    t.same(dispatchedValue([{items: []}, trailer]), {items: []}, 'as does a page object');
    t.same(dispatchedValue([{a: 1}]), [{a: 1}], 'a value with nothing beside it is the answer');
    t.same(dispatchedValue({a: 1}), {a: 1}, 'and an unwrapped answer is already the value');
    t.end();
});
