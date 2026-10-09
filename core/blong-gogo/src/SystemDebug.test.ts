import fastify from 'fastify';
import {test} from 'tap';

import {resolveKeySpec} from '@feasibleone/blong-mle';

import SystemDebug, {publicConfigSnapshot} from './SystemDebug.ts';

/**
 * `/api/sys/config` answers with the merged configuration snapshot, and the gateway's pair sits in it
 * as material the loader resolved — which carries the private half. Handing that to whoever can reach
 * the endpoint would give them the key that signs the tokens the gateway verifies, so the answer is
 * redacted where it is served rather than where it is stored: the pair is configuration, and the rest
 * of that configuration still has to be readable. Dev-intent only, and the guardrail that
 * `systemDebug` is never enabled in production stands on its own (D-448).
 */

const PRIVATE_MEMBERS = ['d', 'p', 'q', 'dp', 'dq', 'qi', 'k', 'oth'];

/** Every private member reachable in a value, by path. */
const privatePaths = (value: unknown, path = ''): string[] => {
    if (Array.isArray(value))
        return value.flatMap((entry, i) => privatePaths(entry, `${path}[${i}]`));
    if (!value || typeof value !== 'object') return [];
    return Object.entries(value as Record<string, unknown>).flatMap(([key, entry]) =>
        PRIVATE_MEMBERS.includes(key) ? [`${path}.${key}`] : privatePaths(entry, `${path}.${key}`),
    );
};

test('the config snapshot keeps non-key properties that happen to be named like one', t => {
    const snapshot = {adapter: {d: 5, deeper: {k: 'value'}}, retries: 3};
    t.same(
        publicConfigSnapshot(snapshot),
        snapshot,
        'a property named `d` or `k` outside a JWK is configuration and stays',
    );
    t.end();
});

test('the config route serves the pair without its private half', async t => {
    const app = fastify();
    const rawSnapshot = {
        gateway: {
            port: 8080,
            sign: await resolveKeySpec({generate: {alg: 'ES384', crv: 'P-384', use: 'sig'}}),
            encrypt: await resolveKeySpec({
                generate: {alg: 'ECDH-ES+A256KW', crv: 'P-384', use: 'enc'},
            }),
        },
        remote: {client: {tls: {ca: '/etc/ca.pem'}}},
    };
    t.ok(
        (rawSnapshot.gateway.sign as {d?: unknown}).d,
        'the snapshot holds the pair as the loader resolved it, private half included',
    );

    // The endpoint is mounted through the gateway, so the stub registers the plugin on a real server.
    const gateway = {
        registerPlugin: (plugin: unknown, options?: unknown) =>
            app.register(plugin as never, options as never),
    };
    const debug = new SystemDebug(
        {enabled: true, routePrefix: '/api/sys', auth: false},
        {gateway: gateway as never, configRuntime: {rawSnapshot} as never},
    );
    await debug.init();

    const answer = await app.inject({method: 'GET', url: '/api/sys/config'});
    t.equal(answer.statusCode, 200, 'the route answers');
    const served = answer.json() as {gateway?: {sign?: Record<string, unknown>}; remote?: unknown};

    t.same(privatePaths(served), [], 'and carries no private member anywhere');
    t.notMatch(answer.body, /"(d|p|q|dp|dq|qi|k)":/, 'nor serialises one');
    t.ok(served.gateway?.sign?.x, 'while the public half of the pair is still readable');
    t.equal(served.gateway?.sign?.kty, 'EC', 'with its key type');
    t.same(
        (served.remote as {client?: unknown})?.client,
        {tls: {ca: '/etc/ca.pem'}},
        'and the rest of the configuration arrives unchanged',
    );

    await app.close();
    t.end();
});
