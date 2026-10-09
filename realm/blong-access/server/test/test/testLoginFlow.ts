import {type IAssert, type IMeta, handler} from '@feasibleone/blong';

/** The members a JWK uses for private material: EC's scalar, RSA's primes, an octet key and its own. */
const PRIVATE_JWK_MEMBERS = ['d', 'p', 'q', 'dp', 'dq', 'qi', 'k', 'oth'];

/** Every private member reachable in a value, by path — the answer nests the pair under `result`. */
const privatePaths = (value: unknown, path = ''): string[] => {
    if (Array.isArray(value)) return value.flatMap((entry, i) => privatePaths(entry, `${path}[${i}]`));
    if (!value || typeof value !== 'object') return [];
    return Object.entries(value as Record<string, unknown>).flatMap(([key, entry]) =>
        PRIVATE_JWK_MEMBERS.includes(key)
            ? [`${path}.${key}`]
            : privatePaths(entry, `${path}.${key}`),
    );
};

export default handler(({lib: {group}, handler: {accessAuthorizationMerge, loginTokenCreate}}) => ({
    testLoginFlow: ({name = 'login token create'}: {name?: string}) =>
        group(name)([
            // Log in with test credentials
            async function login(assert: IAssert, {$meta}: {$meta: IMeta}) {
                const result = await loginTokenCreate<{
                    token_type: string;
                    access_token: string;
                    expires_in: number;
                    refresh_token_expires_in: number;
                    permissions: string[];
                }>({username: 'testUser', password: 'testPassword'}, $meta);
                assert.equal(result.token_type, 'Bearer', 'Token type is Bearer');
                assert.ok(
                    typeof result.access_token === 'string' && result.access_token.length > 0,
                    'Access token is a non-empty string',
                );
                assert.ok(result.expires_in > 0, 'Expires in is a positive number');
                assert.ok(
                    result.refresh_token_expires_in > 0,
                    'Refresh token expires in is a positive number',
                );
                return result;
            },

            // Verify permissions in the token
            async function verifyPermissions(
                assert: IAssert,
                {
                    $meta,
                    login,
                }: {
                    $meta: IMeta;
                    login: Awaited<{
                        permissions: string[];
                    }>;
                },
            ) {
                const t = await login;
                assert.ok(Array.isArray(t.permissions), 'Permissions is an array');
                assert.ok(
                    t.permissions.includes('accessTestPrivate'),
                    'Permissions include accessTestPrivate action',
                );
            },

            // The answer publishes the pair a client verifies the server with and encrypts to, while
            // the private signing key behind the deployment mints the tokens the gateway verifies — so
            // only the public halves may appear here (T-274). It logs in itself rather than reading a
            // previous step's result, so the assertion is about the answer and nothing else: the same
            // check the e2e run makes against a deployment, without a cluster and without a proxy.
            async function noPrivateKeyMaterial(assert: IAssert, {$meta}: {$meta: IMeta}) {
                const login = await loginTokenCreate<{sign?: unknown; encrypt?: unknown}>(
                    {username: 'testUser', password: 'testPassword'},
                    $meta,
                );
                assert.equal(
                    privatePaths(login).join(' '),
                    '',
                    'the login answer carries no private key material',
                );
            },
        ]),
}));
