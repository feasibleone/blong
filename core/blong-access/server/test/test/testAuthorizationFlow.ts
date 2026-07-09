import {type IAssert, type IMeta, handler} from '@feasibleone/blong';

/**
 * Decode a JWT's payload to extract the `per` claim (base64-encoded permissionMap).
 */
function decodePermissionMap(token: string): Buffer {
    const payload = token.split('.')[1];
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return Buffer.from(decoded.per, 'base64');
}

export default handler(({lib: {group}, handler: {loginTokenCreate, accessAuthorizationList}}) => ({
    testAuthorizationFlow: ({name = 'authorization flow'}: {name?: string} = {}) =>
        group(name)([
            // Log in and verify token permissions
            async function loginAndGetToken(assert: IAssert, {$meta}: {$meta: IMeta}) {
                const result = await loginTokenCreate<{
                    token_type: string;
                    access_token: string;
                    expires_in: number;
                    permissions: string[];
                }>({username: 'testUser', password: 'testPassword'}, $meta);
                assert.equal(result.token_type, 'Bearer', 'Token type is Bearer');
                assert.ok(
                    result.permissions.includes('accessTestPrivate'),
                    'Login permissions include accessTestPrivate',
                );
                return result;
            },

            // Call accessAuthorizationList with the permissionMap from the JWT
            // and verify it returns the expected actions in methodId format
            async function checkAuthorizationList(
                assert: IAssert,
                {
                    $meta,
                    loginAndGetToken: loginResult,
                }: {
                    $meta: IMeta;
                    loginAndGetToken: Awaited<{
                        access_token: string;
                        permissions: string[];
                    }>;
                },
            ) {
                const token = await loginResult;
                const permissionMap = decodePermissionMap(token.access_token);

                const actions = await accessAuthorizationList<string[]>({permissionMap}, $meta);

                assert.ok(Array.isArray(actions), 'Result is an array');
                assert.ok(
                    actions.includes('accessTestPrivate'.toLowerCase()),
                    'Actions include "accessTestPrivate" (methodId format)',
                );
                assert.ok(actions.length >= 1, 'At least one action is returned');

                return {actions, permissionMap};
            },

            // Call with an empty/permissionMap Buffer → expect empty array
            async function checkEmptyPermissionMap(assert: IAssert, {$meta}: {$meta: IMeta}) {
                const empty = Buffer.alloc(1, 0); // all bits zero
                const actions = await accessAuthorizationList<string[]>(
                    {permissionMap: empty},
                    $meta,
                );
                assert.ok(Array.isArray(actions), 'Result is an array for empty map');
                assert.equal(actions.length, 0, 'Empty permissionMap returns no actions');
            },

            // Call with a permissionMap that has no matching roles → expect empty array
            async function checkNonExistentRoleBits(assert: IAssert, {$meta}: {$meta: IMeta}) {
                // Set a very high bit that no role covers
                const buf = Buffer.alloc(128, 0);
                buf[120] = 0x01; // set bit 960
                const actions = await accessAuthorizationList<string[]>(
                    {permissionMap: buf},
                    $meta,
                );
                assert.ok(Array.isArray(actions), 'Result is an array');
                assert.equal(actions.length, 0, 'Non-matching bits return no actions');
            },
        ]),
}));
