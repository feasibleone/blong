/**
 * Captures: the ladder, the mask, and the three shapes the framework ships (`@@T-730`).
 *
 * What these assertions pin is the part a reader depends on: that a rung decides how much is rendered
 * (and nothing else does), that the mask withholds rather than merely rendering less, that a scope can
 * add rules but cannot remove the floor, and that a value withheld at one rung stays withheld at the
 * next — a `body` rung that printed what `line` hid would make the whole ladder a lie.
 */

import {test} from 'tap';

import {
    applyMask,
    HIDDEN,
    httpExchange,
    jsonPayload,
    mergeMask,
    tcpFrame,
    withhold,
} from './capture.ts';

test('the mask withholds a path, a deep name and a byte range', async t => {
    const {value, masked} = applyMask(
        {
            headers: {Authorization: 'Bearer abcdefghijkl', accept: 'json'},
            body: {password: 'hunter2', name: 'ann', nested: {token: 'xyz'}},
        },
        {
            paths: [{at: 'headers.authorization', ignoreCase: true}],
            deep: [{match: /password|token/}],
        },
    );
    const shaped = value as {
        headers: Record<string, unknown>;
        body: {password: unknown; name: string; nested: {token: unknown}};
    };
    // The key keeps the spelling the caller used; only the value is withheld, which is why the
    // assertion reads it back under `Authorization` rather than under the rule's own spelling.
    t.equal(shaped.headers.Authorization, HIDDEN, 'a header matched case-insensitively');
    t.equal(shaped.headers.accept, 'json', 'an ordinary header is kept');
    t.equal(shaped.body.password, HIDDEN, 'a name at any depth is withheld');
    t.equal(shaped.body.nested.token, HIDDEN, 'and the same name deeper still');
    t.equal(shaped.body.name, 'ann', 'the rest of the document is untouched');
    t.equal(masked, 3, 'every withheld value is counted');
    t.end();
});

test('partial keeps the ends, hash keeps a stable digest', async t => {
    t.equal(withhold('4242424242421234', 'partial', {head: 4, tail: 4}), '4242********1234');
    t.equal(
        withhold('short', 'partial', {head: 4, tail: 4}),
        HIDDEN,
        'a value too short to trim is hidden',
    );
    const once = withhold('a-secret', 'hash');
    const twice = withhold('a-secret', 'hash');
    t.equal(once, twice, 'the digest is stable');
    t.not(once, withhold('another-secret', 'hash'), 'and distinct for another value');
    t.ok(String(once).startsWith('#'), 'and reads as a digest rather than the value');
    t.end();
});

test('the floor cannot be removed and a scope can add to it', async t => {
    const merged = mergeMask({deep: [{match: /password/}]}, {deep: [{match: /pin/}], bytes: []});
    const {value} = applyMask({password: 'a', pin: 'b', other: 'c'}, merged);
    const shaped = value as Record<string, unknown>;
    t.equal(shaped.password, HIDDEN, 'the shape floor still applies');
    t.equal(shaped.pin, HIDDEN, 'and the scope rule does too');
    t.equal(shaped.other, 'c');
    t.end();
});

test('the HTTP ladder renders more at each rung, and never more of a secret', async t => {
    const exchange = {
        phase: 'request' as const,
        method: 'POST',
        url: 'https://host/accounts',
        headers: {authorization: 'Bearer abcdefghijkl', accept: 'json'},
        body: {iban: 'DE89370400440532013000', amount: 10},
    };
    const line = httpExchange.render(exchange, 'line', {}, 'text');
    t.equal(line.summary, 'POST https://host/accounts', 'the line is the answer');
    t.equal(line.fields?.headers, undefined, 'no header names at line');
    t.equal(line.payload, undefined, 'and no body');

    const headers = httpExchange.render(exchange, 'headers', {}, 'text');
    t.equal(headers.fields?.headers, 'authorization, accept', 'names are shown');
    t.equal(headers.payload, undefined, 'values still are not');

    // The exchange's floor is about header *names*; an account in a body is the scope's business, so
    // the rule that withholds it is passed here rather than shipped in the shape.
    const body = httpExchange.render(exchange, 'body', {paths: [{at: 'body.iban'}]}, 'text');
    t.ok(
        String(body.payload).includes('DE89370400440532013000') === false,
        'the account is withheld',
    );
    t.ok(String(body.payload).includes(HIDDEN), 'and the record says so');
    t.ok(body.masked >= 1, 'withheld values are counted');
    t.end();
});

test('a binary frame withholds a byte range and says how long it was', async t => {
    const data = new Uint8Array([0x30, 0x32, 0x31, 0x30, 0x31, 0x32, 0x33, 0x34]);
    const frame = tcpFrame.render(
        {direction: 'in', data},
        'hex',
        {bytes: [{offset: 2, length: 3}]},
        'text',
    );
    t.equal(frame.bytes, 8, 'the size is reported, not hidden');
    t.not(String(frame.payload).includes('31 20 31'), 'the masked range is not in the hex');
    t.equal(frame.masked, 3, 'three bytes withheld');
    t.equal(frame.fields?.direction, 'in');
    t.end();
});

test('a JSON document shows its keys before its content', async t => {
    const payload = {label: 'k8s.event', value: {kind: 'Pod', password: 'x', spec: {a: 1}}};
    const line = jsonPayload.render(payload, 'line', {}, 'text');
    t.same(
        line.fields?.keys,
        ['kind', 'password', 'spec'],
        'the top-level keys are the answer at line',
    );
    t.equal(line.fields?.body, undefined, 'and the content is not');
    const keys = jsonPayload.render(payload, 'keys', {}, 'text');
    t.equal(keys.fields?.body, undefined, 'the keys rung still keeps the content back');
    const body = jsonPayload.render(payload, 'body', {}, 'text');
    t.ok(String(body.payload).includes(HIDDEN), 'the body rung masks before rendering');
    t.not(String(body.payload).includes('"x"'), 'and the secret is nowhere in it');
    t.end();
});
