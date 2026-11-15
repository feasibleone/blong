import t from 'tap';

import errorMap from './error.ts';

const sample: Record<string, Record<string, string | number>> = {
    'blob.notFound': {namespace: 'party', key: 'a'},
    'blob.scopeDenied': {namespace: 'party', key: 'a'},
    'blob.tooLarge': {size: 10, limit: 5},
    'blob.extensionNotAllowed': {extension: 'exe'},
    'blob.contentTypeMismatch': {extension: 'pdf', contentType: 'text/plain'},
    'blob.uploadExpired': {key: 'a', expiresAt: '2026-01-01T00:00:00.000Z'},
    'blob.uploadIncomplete': {key: 'a'},
    'blob.uploadAlreadyStored': {key: 'a'},
    'blob.configurationError': {reason: 'scope provider "party.scope.grant" is not registered'},
    'blob.storageFailed': {reason: 'EIO'},
    'blob.corrupt': {namespace: 'party', key: 'a'},
    'blob.namespaceUnknown': {namespace: 'sport'},
    'blob.cryptoUnconfigured': {},
    'blob.cryptoInvalid': {length: 4},
};

const render = (message: string, params: Record<string, string | number>) =>
    message.replace(/\{(\w+)\}/g, (whole, name: string) =>
        name in params ? String(params[name]) : whole,
    );

t.test('every error carries a message and the status a caller acts on', async t => {
    for (const [type, value] of Object.entries(errorMap)) {
        t.ok(value.message, `${type} has a message`);
        t.equal(typeof value.statusCode, 'number', `${type} has a status code`);
        t.ok(value.statusCode >= 400, `${type} is a refusal, not a success`);
    }
    t.equal(errorMap['blob.notFound'].statusCode, 404, 'a missing blob is 404');
    t.equal(errorMap['blob.scopeDenied'].statusCode, 403, 'a scope refusal is 403');
    t.equal(errorMap['blob.tooLarge'].statusCode, 413, 'an oversized payload is 413');
    t.equal(errorMap['blob.extensionNotAllowed'].statusCode, 415, 'a refused type is 415');
    t.equal(errorMap['blob.contentTypeMismatch'].statusCode, 415, 'a mismatched type is 415');
    t.equal(errorMap['blob.uploadExpired'].statusCode, 410, 'an expired upload is 410');
    t.equal(errorMap['blob.uploadIncomplete'].statusCode, 409, 'an incomplete upload is 409');
    t.equal(
        errorMap['blob.uploadAlreadyStored'].statusCode,
        409,
        'a second write of one upload is 409',
    );
    t.equal(errorMap['blob.configurationError'].statusCode, 500, 'a misconfiguration is 500');
    t.equal(errorMap['blob.storageFailed'].statusCode, 502, 'a backend failure is 502');
    t.equal(errorMap['blob.corrupt'].statusCode, 500, 'a corrupt blob is 500');
});

t.test('every placeholder a message names is one its caller supplies', async t => {
    for (const [type, value] of Object.entries(errorMap)) {
        const rendered = render(value.message, sample[type] ?? {});
        t.notMatch(rendered, /\{\w+\}/, `${type} renders without a leftover placeholder`);
    }
});
