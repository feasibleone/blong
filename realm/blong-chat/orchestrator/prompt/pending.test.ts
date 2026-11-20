import type {IChatPromptParams} from '@feasibleone/blong/types';
import {test} from 'tap';

import {
    pendingAdd,
    pendingForConversation,
    pendingGetMatching,
    pendingKey,
    pendingKeys,
    pendingList,
    pendingPickMatching,
    pendingTakeMatching,
    type IParkedPrompt,
} from './pending.ts';

/**
 * Finding the question an inbound answers.
 *
 * The four parts of the key exist so two conversations cannot answer each other's question, and one
 * of them — the account — is the one an asker cannot always know: `blong-dev` asks from a shell and
 * names a conversation, while every inbound carries the account that verified it. This is the bug
 * that made a question wait for its timeout while the person's click was acknowledged as a question
 * nobody was waiting for, and a typed reply was dropped as a message nobody configured a consumer
 * for. What is pinned here is the rule that closes it: a question that named no account matches any,
 * and one that named an account matches only that one.
 */

const params = (overrides: Partial<IChatPromptParams> = {}): IParkedPrompt => ({
    platform: 'slack',
    account: 'blong-bot',
    conversationId: 'C0CK271R4L9',
    prompt: {promptId: 'p1', kind: 'choice', text: 'take it?'},
    ...overrides,
});

/** A parked question that nobody settles: the resolve/reject are never called in these tests. */
const park = (entry: IParkedPrompt): string => {
    const key = pendingKey(entry.prompt.promptId, entry);
    pendingAdd({
        key,
        params: entry,
        resolve: () => undefined,
        reject: () => undefined,
        timer: setTimeout(() => undefined, 60_000).unref(),
    });
    return key;
};

test('a question asked with no account is filed under none', t => {
    const {account: _account, ...unnamed} = params();
    t.equal(
        pendingKey('p1', unnamed),
        'slack||C0CK271R4L9|p1',
        'the account segment is empty, which is what no caller can fill in from a shell',
    );
    t.end();
});

test('a lookup tries the exact key, then the account-less one', t => {
    t.same(
        pendingKeys('p1', params()),
        ['slack|blong-bot|C0CK271R4L9|p1', 'slack||C0CK271R4L9|p1'],
        'the account the inbound carries, and the one an asker may have left empty',
    );
    t.same(
        pendingKeys('p1', {platform: 'slack', conversationId: 'C1'}),
        ['slack||C1|p1'],
        'and an inbound with no account asks the same question once, not twice',
    );
    t.end();
});

test('an answer settles a question that named no account', t => {
    const {account: _account, ...unnamed} = params();
    park({...unnamed, prompt: {promptId: 'p1', kind: 'choice', text: 'take it?'}});

    const entry = pendingTakeMatching('p1', {
        platform: 'slack',
        account: 'blong-bot',
        conversationId: 'C0CK271R4L9',
    });
    t.ok(entry, 'the click found the ask it answers, though the ask named no account');
    t.equal(entry?.params.prompt.promptId, 'p1');
    t.equal(pendingTakeMatching('p1', params()), undefined, 'and an answer is delivered once');
    t.end();
});

test('an answer settles a question that named the same account', t => {
    park(params());
    t.ok(
        pendingTakeMatching('p1', params()),
        'a question that named an account still settles, which is the case that already worked',
    );
    t.end();
});

test('an answer does not settle a question from another account or conversation', t => {
    park(params());
    t.equal(
        pendingTakeMatching('p1', {...params(), account: 'other-bot'}),
        undefined,
        'naming an account is a caller saying which one it means',
    );
    t.equal(
        pendingTakeMatching('p1', {...params(), conversationId: 'C-other'}),
        undefined,
        'and a question belongs to the conversation it was asked in',
    );
    t.end();
});

test('a typed reply claims a question asked with no account', t => {
    const {account: _account, ...unnamed} = params();
    park({...unnamed, prompt: {promptId: 'p2', kind: 'text', text: 'what next?'}});

    const found = pendingForConversation({
        platform: 'slack',
        account: 'blong-bot',
        conversationId: 'C0CK271R4L9',
    });
    t.equal(
        found?.params.prompt.promptId,
        'p2',
        'the newest question for the conversation claims it',
    );
    t.equal(
        pendingForConversation({
            platform: 'viber',
            account: 'blong-bot',
            conversationId: 'C0CK271R4L9',
        }),
        undefined,
        'and a message on another platform does not',
    );
    t.end();
});

test('a toggle is remembered against a question asked with no account', t => {
    const {account: _account, ...unnamed} = params();
    park({...unnamed, prompt: {promptId: 'p3', kind: 'multiChoice', text: 'which?'}});

    t.ok(
        pendingPickMatching('p3', {...params(), account: 'blong-bot'}, {values: ['a']}),
        'the tick reaches the question the submit will answer',
    );
    t.same(
        pendingGetMatching('p3', params())?.pick,
        {values: ['a']},
        'and the controls it holds are the ones a form request renders',
    );
    t.end();
});

test('what is waiting is listed for a reader', t => {
    park({...params(), prompt: {promptId: 'p9', kind: 'text', text: 'listed?'}});
    // The store is the process's, so earlier tests' questions are still parked beside this one: what
    // is asserted is that this question is visible with the conversation it was asked in, not a count.
    const listed = pendingList().find(entry => entry.prompt.promptId === 'p9');
    t.equal(listed?.conversationId, 'C0CK271R4L9');
    t.equal(listed?.account, 'blong-bot', 'and with the account it named');
    t.end();
});
