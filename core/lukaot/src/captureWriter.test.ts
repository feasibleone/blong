/**
 * The capture surface: an absent member costs nothing, and a refused selection builds no payload.
 *
 * The whole reason this surface exists rather than a `capture(shape, value)` function is the cost of a
 * payload nobody wants. These assertions pin that cost, because it is invisible in ordinary use: a call
 * site with `?.` looks identical whether or not the arguments were evaluated.
 */

import {test} from 'tap';

import {createCaptureSurface, familyOf} from './captureWriter.ts';
import type {ICapture} from './declare.ts';

const httpCapture: ICapture = {
    kind: 'capture',
    id: 'httpExchange',
    shape: 'http.exchange',
    level: 'line',
    message: 'http exchange',
};

const exchange = () => ({
    phase: 'request' as const,
    method: 'POST',
    url: 'https://host/accounts',
    headers: {authorization: 'Bearer abcdefghijkl'},
    body: {iban: 'DE89370400440532013000'},
});

test('a shape family names the member', async t => {
    t.equal(familyOf('http.exchange'), 'http');
    t.equal(familyOf('tcp.frame'), 'tcp');
    t.equal(familyOf('json'), 'json');
    t.equal(familyOf('iso8583.frame'), 'iso8583', 'a realm-registered shape gets its own member');
    t.end();
});

test('no declaration means no surface at all', async t => {
    const surface = createCaptureSurface({
        capture: {},
        resolve: () => undefined,
        write: () => undefined,
    });
    t.same(surface, {}, 'nothing to chain onto, so nothing is evaluated');
    t.end();
});

test('a refused selection never builds the payload', async t => {
    let built = 0;
    const written: unknown[] = [];
    const surface = createCaptureSurface({
        capture: {httpExchange: httpCapture},
        resolve: () => undefined,
        write: record => written.push(record),
    });
    t.type(surface.http, 'function', 'the member exists, because the declaration does');
    surface.http?.({method: 'db.subject.find'}, () => {
        built += 1;
        return exchange();
    });
    t.equal(built, 0, 'the thunk was not called');
    t.equal(written.length, 0, 'and nothing was written');
    t.end();
});

test('an enabled selection renders at the rung the policy asked for', async t => {
    const written: Array<Record<string, unknown>> = [];
    const surface = createCaptureSurface({
        capture: {httpExchange: httpCapture},
        resolve: () => ({level: 'headers', mask: {paths: [{at: 'body.iban'}]}}),
        write: record => written.push(record as unknown as Record<string, unknown>),
    });
    surface.http?.({method: 'POST'}, exchange);
    const [record] = written;
    t.equal(record?.id, 'httpExchange');
    t.equal(record?.level, 'headers', 'the policy raised the rung past the declaration default');
    t.equal(record?.message, 'http exchange', 'the declared note is the sentence');
    t.equal(record?.payload, undefined, 'the headers rung keeps the body back');
    t.same(
        (record?.fields as Record<string, unknown>)?.headers,
        'authorization',
        'the header names are shown, their values withheld',
    );
    t.end();
});

test('the body rung masks before it renders, and counts what it withheld', async t => {
    const written: Array<Record<string, unknown>> = [];
    const surface = createCaptureSurface({
        capture: {httpExchange: httpCapture},
        resolve: () => ({level: 'body', mask: {paths: [{at: 'body.iban'}]}}),
        write: record => written.push(record as unknown as Record<string, unknown>),
    });
    surface.http?.({method: 'POST'}, exchange);
    const [record] = written;
    t.notOk(String(record?.payload).includes('DE89370400440532013000'), 'the account is gone');
    t.ok(Number(record?.masked) >= 1, 'and the record says something was withheld');
    t.end();
});

test('a sample of zero captures nothing and one captures everything', async t => {
    const surfaceFor = (sample: number) => {
        const written: unknown[] = [];
        const surface = createCaptureSurface({
            capture: {httpExchange: {...httpCapture, sample}},
            resolve: () => ({level: 'line'}),
            write: record => written.push(record),
            random: () => 0.5,
        });
        surface.http?.({method: 'POST'}, exchange);
        return written.length;
    };
    t.equal(surfaceFor(0), 0, 'a sample below the draw is skipped');
    t.equal(surfaceFor(1), 1, 'a sample above it is taken');
    t.end();
});

test('a declared-off capture is offered to the host, which has the last word', async t => {
    // The surface does not judge `enabled`: the host holds the configuration, and a declaration that
    // said `false` was what made an operator's `enabled: true` a no-op — the surface returned before
    // asking. Both answers are pinned here, because the contract is that it asks (@@F-770).
    const asked: string[] = [];
    const written: unknown[] = [];
    const surface = createCaptureSurface({
        capture: {httpExchange: {...httpCapture, enabled: false}},
        resolve: entry => {
            asked.push(entry.id);
            return {level: 'line'};
        },
        write: record => written.push(record),
    });
    surface.http?.({method: 'POST'}, exchange);
    t.same(asked, ['httpExchange'], 'the declaration is offered to the resolver, not skipped');
    t.equal(written.length, 1, 'and the host that says yes gets its record');

    const refused: unknown[] = [];
    let built = 0;
    createCaptureSurface({
        capture: {httpExchange: {...httpCapture, enabled: false}},
        resolve: () => undefined,
        write: record => refused.push(record),
    }).http?.({method: 'POST'}, () => {
        built += 1;
        return exchange();
    });
    t.equal(refused.length, 0, 'a host that answers undefined writes nothing');
    t.equal(built, 0, 'and the payload is never built');
    t.end();
});
