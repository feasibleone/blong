import t from 'tap';

import {BLOB_SCOPE_AUTHENTICATED} from '@feasibleone/blong/blob';

import {blobScopeCollect} from './blobScopeCollect.ts';

t.test('providers answer arrays or {scopes} and the list is deduplicated', async t => {
    const scopes = blobScopeCollect(
        [['party:org:1', 'party:unit:2'], {scopes: ['party:unit:2', 'sport:club:3']}],
        'actor-1',
    );
    t.same(
        scopes,
        ['party:org:1', 'party:unit:2', 'sport:club:3', BLOB_SCOPE_AUTHENTICATED],
        'every grant once, and the authenticated token added for a known actor',
    );
});

t.test('an anonymous caller gets nothing but what was asked for', async t => {
    t.same(blobScopeCollect([], undefined), [], 'no actor and no providers is no scope');
    t.same(
        blobScopeCollect([['party:org:1']], undefined),
        ['party:org:1'],
        'a provider grant survives without an actor',
    );
});

t.test('a list longer than the cap loses the broadest tokens first', async t => {
    const many = Array.from({length: 70}, (_value, index) => `party:unit:${index}`);
    const scopes = blobScopeCollect([many], 'actor-1', 64);
    t.equal(scopes.length, 64, 'the list is capped');
    t.ok(scopes.includes('party:unit:69'), 'the narrowest tokens are kept');
    t.notOk(scopes.includes('party:unit:0'), 'and the broadest are dropped');
    t.ok(scopes.includes(BLOB_SCOPE_AUTHENTICATED), 'the authenticated token is never dropped');
});

t.test('what a provider sends that is not a token is ignored', async t => {
    t.same(
        blobScopeCollect([['ok', '', '  ', null, 42], null, 'nope', {}], undefined),
        ['ok'],
        'only tokens survive',
    );
});
