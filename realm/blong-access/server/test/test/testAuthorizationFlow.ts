import {type IAssert, type IMeta, handler} from '@feasibleone/blong';

/**
 * Decode a JWT's payload to extract the `per` claim (base64-encoded permissionMap).
 */
function decodePermissionMap(token: string): Buffer {
    const payload = token.split('.')[1];
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return Buffer.from(decoded.per, 'base64');
}

export default handler(
    ({
        lib: {group},
        handler: {loginTokenCreate, accessAuthorizationList, accessAuthorizationMerge},
    }) => ({
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

                // A test seed declares a capability's action list as complete (`replace`), so a list
                // it shortens must retract the dropped edge.  F-357 recorded the opposite: the
                // removed action stayed in the graph and every fixture that expanded the capability
                // failed against a list nobody had written.  `testManagement` is the only capability
                // that grants `accessTestPrivate`, so a fresh login's permissions show the retraction
                // — and the restore at the end leaves the database as the seed declares it.
                async function checkReplaceRetractsDroppedAction(
                    assert: IAssert,
                    {$meta}: {$meta: IMeta},
                ) {
                    const login = () =>
                        loginTokenCreate<{permissions: string[]}>(
                            {username: 'testUser', password: 'testPassword'},
                            $meta,
                        );
                    const before = await login();
                    assert.ok(
                        before.permissions.includes('accessTestPrivate'),
                        'testManagement grants accessTestPrivate before the shrink',
                    );

                    await accessAuthorizationMerge<{success: boolean}>(
                        {replace: true, capability: {testManagement: 'subject.object.schema'}},
                        $meta,
                    );
                    const shrunk = await login();
                    assert.ok(
                        !shrunk.permissions.includes('accessTestPrivate'),
                        'a shortened capability list retracts the dropped action',
                    );

                    await accessAuthorizationMerge<{success: boolean}>(
                        {
                            replace: true,
                            capability: {
                                testManagement: 'accessTestPrivate,subject.object.schema',
                            },
                        },
                        $meta,
                    );
                    const restored = await login();
                    assert.ok(
                        restored.permissions.includes('accessTestPrivate'),
                        'restoring the list restores the action',
                    );
                },
            ]),
    }),
);
