import t from 'tap';

import {
    BLOB_SCOPE_ANONYMOUS,
    BLOB_SCOPE_AUTHENTICATED,
    blobScopeMatch,
    blobUriFormat,
    blobUriParse,
} from '@feasibleone/blong/blob';

t.test('a stored reference round-trips through its URI', async t => {
    const reference = {namespace: 'party', key: '01J9Z6Q0K8Y3M4N5P6R7S8T9V0'};
    const uri = blobUriFormat(reference);
    t.equal(uri, 'blob://party/01J9Z6Q0K8Y3M4N5P6R7S8T9V0', 'the scheme names both segments');
    t.same(blobUriParse(uri), reference, 'and reads back as what it was made from');
});

t.test('a value that is not a stored reference is refused, not half-read', async t => {
    for (const value of [
        '',
        '/a/party/key',
        'blob://party',
        'blob://party/',
        'blob:///key',
        'blob://party/key/thumb',
        'blob://Party/key',
        'blob://party/key?download=1',
        'https://example.test/photo.png',
        null,
        undefined,
        42,
    ]) {
        t.equal(blobUriParse(value), null, `${JSON.stringify(value)} is not a reference`);
    }
});

t.test('an anonymous blob opens without a cookie', async t => {
    t.equal(
        blobScopeMatch({scopes: [BLOB_SCOPE_ANONYMOUS], scopeMode: 'any'}, []),
        true,
        'an empty scope list reads an anonymous blob',
    );
    t.equal(
        blobScopeMatch({scopes: [BLOB_SCOPE_ANONYMOUS, 'party:org:1'], scopeMode: 'all'}, []),
        true,
        'anonymous wins over a mode that would otherwise demand more',
    );
});

t.test('a blob that names no scope is refused', async t => {
    t.equal(blobScopeMatch({scopes: [], scopeMode: 'any'}, []), false, 'empty is not public');
    t.equal(
        blobScopeMatch({scopes: [], scopeMode: 'any'}, [BLOB_SCOPE_ANONYMOUS]),
        false,
        'and not even a caller holding anonymous opens it',
    );
    t.equal(
        blobScopeMatch({scopes: null as unknown as string[], scopeMode: 'any'}, ['party:org:1']),
        false,
        'a metadata record that lost its scope list is refused rather than opened',
    );
});

t.test('any asks for one scope, all asks for every one', async t => {
    const meta = {scopes: ['party:org:1', 'party:unit:2'], scopeMode: 'any' as const};
    t.equal(blobScopeMatch(meta, ['party:org:1']), true, 'one of two is enough for any');
    t.equal(blobScopeMatch(meta, ['party:org:9']), false, 'a different grant is not');
    t.equal(blobScopeMatch(meta, []), false, 'and neither is nothing');

    const strict = {scopes: ['party:org:1', 'party:unit:2'], scopeMode: 'all' as const};
    t.equal(blobScopeMatch(strict, ['party:org:1']), false, 'all needs both');
    t.equal(
        blobScopeMatch(strict, ['party:org:1', 'party:unit:2', 'party:unit:3']),
        true,
        'and extra grants do not hurt',
    );
});

t.test('an authenticated caller is a scope like any other', async t => {
    const meta = {scopes: [BLOB_SCOPE_AUTHENTICATED], scopeMode: 'any' as const};
    t.equal(blobScopeMatch(meta, [BLOB_SCOPE_AUTHENTICATED]), true, 'the token matches itself');
    t.equal(blobScopeMatch(meta, ['party:org:1']), false, 'a narrower grant is not the token');
});
