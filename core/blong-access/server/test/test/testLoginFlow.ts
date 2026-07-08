import {type IAssert, type IMeta, handler} from '@feasibleone/blong';

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
                    t.permissions.includes('userView'),
                    'Permissions include userView action',
                );
            },
        ]),
}));
