import t from 'tap';

import {blobScopeVerify} from '../../blob/blobScope.ts';
import scopeIssue from './blobScopeIssue.ts';

/** The error layer, as the framework hands it to a handler: one factory per type. */
const errors = new Proxy(
    {},
    {
        get:
            (_target, type: string) =>
            ({params}: {params?: Record<string, unknown>} = {}) =>
                Object.assign(new Error(`${type} ${JSON.stringify(params ?? {})}`), {
                    type,
                    ...params,
                }),
    },
) as Record<string, (options?: {params?: Record<string, unknown>}) => Error>;

const SECRET = 'a-cookie-secret';

type Issue = (
    params: {scopes?: string[]},
    $meta: object,
) => Promise<{scopes: string[]; expiresIn: number}>;

/**
 * `blob.scope.issue` — the cookie an answer carries, called the way the framework calls it.
 *
 * The framework calls a handler as a method of the port, so `this.config` is the realm's own settings
 * (`blob.blobDispatch`); a test that called the factory alone would read the group's empty slice and
 * see no secret (@@F-641).
 */
function subject(
    config: Record<string, unknown>,
    providers: Record<string, (params: object, $meta: object) => Promise<unknown>> = {},
) {
    const methods = (scopeIssue as unknown as (api: unknown) => {blobScopeIssue: Issue})({
        errors,
        config: {},
        handler: providers,
    });
    const port = {config};
    return {
        issue: (params: {scopes?: string[]}, $meta: object) =>
            methods.blobScopeIssue.call(port, params, $meta),
    };
}

t.test('the providers and the caller are what the cookie grants', async t => {
    const asked: string[] = [];
    const {issue} = subject(
        {cookie: {secret: SECRET, ttl: 60}, scope: {providers: ['party.scope.grant']}},
        {
            partyScopeGrant: async () => {
                asked.push('party');
                return {scopes: ['party:person:1', 'party:unit:2']};
            },
        },
    );
    const meta = {auth: {actorId: 'actor-1'}, httpResponse: undefined as unknown};
    const answer = await issue({scopes: ['sport:club:3']}, meta);
    t.same(asked, ['party'], 'every configured provider is asked, in order');
    t.same(
        answer.scopes,
        ['party:person:1', 'party:unit:2', 'sport:club:3', 'authenticated'],
        'the answer names what the cookie carries',
    );
    t.equal(answer.expiresIn, 60, 'and how long it lasts');

    const state = (meta.httpResponse as {state?: [string, string, Record<string, unknown>][]})
        ?.state?.[0];
    t.ok(state, 'the answer sets the cookie');
    const [name, value, options] = state!;
    t.equal(name, 'blob.blob', 'under the configured name');
    const token = blobScopeVerify(value, SECRET);
    t.same(token?.scopes, answer.scopes, 'and the value verifies to the same scopes');
    t.equal(token?.actorId, 'actor-1', 'for the caller it was issued to');
    t.equal(options['path'], '/a/', 'the cookie is scoped to the serving path');
    t.equal(options['isHttpOnly'], true, 'and is not reachable from a script');
});

t.test('a provider the process does not carry is a configuration error', async t => {
    const {issue} = subject({cookie: {secret: SECRET}, scope: {providers: ['party.scope.grant']}});
    await t.rejects(
        issue({}, {auth: {actorId: 'actor-1'}}),
        /party\.scope\.grant/,
        'the refusal names the provider a deployment forgot',
    );
});

t.test('without a secret no cookie is minted, and the scopes are still answered', async t => {
    const {issue} = subject({});
    const meta = {httpResponse: undefined as unknown};
    const answer = await issue({scopes: ['party:person:1']}, meta);
    t.same(answer.scopes, ['party:person:1'], 'an unauthenticated caller holds what it asked for');
    t.equal(meta.httpResponse, undefined, 'and nothing is set on the answer');
});
