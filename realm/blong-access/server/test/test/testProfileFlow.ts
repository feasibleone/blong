import {type IAssert, type IMeta, handler} from '@feasibleone/blong';

/**
 * server/test/test/testProfileFlow.ts — server-side flow for the self-service
 * profile handlers (`access.profile.get` / `.edit` / `.password.change`).
 *
 * 1. Logs in as `testAdmin`, decodes the JWT `sub` (the actor id) from the
 *    access token.
 * 2. Reads the profile and asserts the account shape (username, active flag,
 *    granted Admin role; `person` is null in the standalone access suite).
 * 3. Edits email + preferred language and reads them back.
 * 4. Exercises the password change: wrong current password → `profile.wrongPassword`,
 *    too-short new password → `account.weakPassword`, correct flow → success,
 *    and the session stays valid afterwards (no forced re-login).
 * 5. Restores the original password + email + language so the shared dev DB
 *    stays stable for other tests / Playwright.
 *
 * Registered as the `test.profile.flow` group (`integration.watch.test` in
 * index.ts).
 */
function decodeJwtSub(token: string): string {
    const payload = token.split('.')[1];
    return JSON.parse(Buffer.from(payload, 'base64url').toString()).sub as string;
}

export default handler(
    ({
        lib: {group},
        handler: {
            loginTokenCreate,
            accessProfileGet,
            accessProfileEdit,
            accessProfilePasswordChange,
        },
    }) => ({
        testProfileFlow: ({name = 'profile flow'}: {name?: string} = {}) =>
            group(name)([
                // 1. Authenticate as testAdmin and grab the access token.
                async function login(assert: IAssert, {$meta}: {$meta: IMeta}) {
                    const result = await loginTokenCreate<{
                        access_token: string;
                        permissions: string[];
                    }>({username: 'testAdmin', password: 'testPassword'}, $meta);
                    assert.ok(
                        typeof result.access_token === 'string' && result.access_token.length > 0,
                        'login returns a non-empty access token',
                    );
                    return result;
                },

                // 2. Decode the actor id (JWT `sub`) used by the profile handlers.
                async function getActor(
                    assert: IAssert,
                    {login}: {login: Awaited<{access_token: string}>},
                ) {
                    const token = await login;
                    const actorId = decodeJwtSub(token.access_token);
                    assert.ok(typeof actorId === 'string' && actorId.length > 0, 'actor id decoded');
                    return actorId;
                },

                // 3. Read the profile — account shape + roles.
                async function getProfile(
                    assert: IAssert,
                    {
                        $meta,
                        getActor: actor,
                    }: {$meta: IMeta; getActor: Promise<string>},
                ) {
                    const actorId = await actor;
                    const profile = await accessProfileGet<{
                        userId: string;
                        userName: string | null;
                        emailAddress: string | null;
                        isActive: boolean;
                        preferredLanguage: string | null;
                        roles: Array<{roleId: string; roleName: string}>;
                        person: unknown;
                    }>({}, {...$meta, auth: {actorId}});
                    assert.equal(profile.userId, actorId, 'profile userId is the actor id');
                    assert.equal(profile.userName, 'testAdmin', 'userName is testAdmin');
                    assert.equal(profile.isActive, true, 'account is active');
                    assert.ok(
                        profile.roles.some(r => r.roleName === 'Admin'),
                        'Admin role is granted',
                    );
                    assert.equal(profile.person, null, 'no party.person in the access suite');
                    return profile;
                },

                // 4. Edit email + preferred language, then read them back.
                async function editProfile(
                    assert: IAssert,
                    {
                        $meta,
                        getProfile: p,
                    }: {
                        $meta: IMeta;
                        getProfile: Promise<{userId: string; emailAddress: string | null}>;
                    },
                ) {
                    const original = await p;
                    const email = `profile-test-${Date.now()}@example.com`;
                    const result = await accessProfileEdit<{success: boolean}>(
                        {emailAddress: email, preferredLanguage: 'bg'},
                        {...$meta, auth: {actorId: original.userId}},
                    );
                    assert.equal(result.success, true, 'profile edit succeeds');
                    const after = await accessProfileGet<{
                        emailAddress: string | null;
                        preferredLanguage: string | null;
                    }>({}, {...$meta, auth: {actorId: original.userId}});
                    assert.equal(after.emailAddress, email, 'email is persisted');
                    assert.equal(after.preferredLanguage, 'bg', 'preferred language is persisted');
                    return {actorId: original.userId, email, original};
                },

                // 5. Wrong current password is refused.
                async function wrongPassword(
                    assert: IAssert,
                    {
                        $meta,
                        editProfile: ctx,
                    }: {$meta: IMeta; editProfile: Promise<{actorId: string}>},
                ) {
                    const {actorId} = await ctx;
                    let failed = false;
                    let failureType = '';
                    try {
                        await accessProfilePasswordChange(
                            {currentPassword: 'wrong-password', newPassword: 'NewPass123!'},
                            {...$meta, auth: {actorId}, expect: ['profile.wrongPassword']},
                        );
                    } catch (error) {
                        failed = true;
                        failureType = (error as {type?: string}).type ?? '';
                    }
                    assert.equal(failed, true, 'wrong current password is refused');
                    assert.equal(
                        failureType,
                        'profile.wrongPassword',
                        'failure type is profile.wrongPassword',
                    );
                    return ctx;
                },

                // 6. Too-short new password is refused by the policy.
                async function weakPassword(
                    assert: IAssert,
                    {
                        $meta,
                        wrongPassword: ctx,
                    }: {$meta: IMeta; wrongPassword: Promise<{actorId: string}>},
                ) {
                    const {actorId} = await ctx;
                    let failed = false;
                    let failureType = '';
                    try {
                        await accessProfilePasswordChange(
                            {currentPassword: 'testPassword', newPassword: 'short'},
                            {...$meta, auth: {actorId}, expect: ['account.weakPassword']},
                        );
                    } catch (error) {
                        failed = true;
                        failureType = (error as {type?: string}).type ?? '';
                    }
                    assert.equal(failed, true, 'weak new password is refused');
                    assert.equal(
                        failureType,
                        'account.weakPassword',
                        'failure type is account.weakPassword',
                    );
                    return ctx;
                },

                // 7. Correct flow — password rotates and the session stays valid.
                async function changePassword(
                    assert: IAssert,
                    {
                        $meta,
                        weakPassword: ctx,
                    }: {$meta: IMeta; weakPassword: Promise<{actorId: string}>},
                ) {
                    const {actorId} = await ctx;
                    const result = await accessProfilePasswordChange<{success: boolean}>(
                        {currentPassword: 'testPassword', newPassword: 'NewPass123!'},
                        {...$meta, auth: {actorId}},
                    );
                    assert.equal(result.success, true, 'password change succeeds');
                    // Keep-current-session: the same bearer session still works.
                    const after = await accessProfileGet<{userName: string | null}>(
                        {},
                        {...$meta, auth: {actorId}},
                    );
                    assert.equal(after.userName, 'testAdmin', 'session stays valid after change');
                    return ctx;
                },

                // 8. The new password actually logs the user in.
                async function loginWithNew(
                    assert: IAssert,
                    {$meta}: {$meta: IMeta},
                ) {
                    const result = await loginTokenCreate<{access_token: string}>(
                        {username: 'testAdmin', password: 'NewPass123!'},
                        $meta,
                    );
                    assert.ok(
                        typeof result.access_token === 'string' && result.access_token.length > 0,
                        'login with the new password succeeds',
                    );
                },

                // 9. Restore the original password so the shared dev DB stays
                //    stable for the rest of the test suite / Playwright.
                async function restorePassword(assert: IAssert, {$meta}: {$meta: IMeta}) {
                    const login = await loginTokenCreate<{access_token: string}>(
                        {username: 'testAdmin', password: 'NewPass123!'},
                        $meta,
                    );
                    const actorId = decodeJwtSub(login.access_token);
                    const result = await accessProfilePasswordChange<{success: boolean}>(
                        {currentPassword: 'NewPass123!', newPassword: 'testPassword'},
                        {...$meta, auth: {actorId}},
                    );
                    assert.equal(result.success, true, 'original password is restored');
                    return actorId;
                },

                // 10. Restore the original email + language.
                async function restoreProfile(
                    assert: IAssert,
                    {
                        $meta,
                        editProfile: ctx,
                        restorePassword: actor,
                    }: {
                        $meta: IMeta;
                        editProfile: Promise<{
                            actorId: string;
                            original: {emailAddress: string | null};
                        }>;
                        restorePassword: Promise<string>;
                    },
                ) {
                    const {original} = await ctx;
                    const actorId = await actor;
                    const result = await accessProfileEdit<{success: boolean}>(
                        {
                            emailAddress: original.emailAddress,
                            preferredLanguage: null,
                        },
                        {...$meta, auth: {actorId}},
                    );
                    assert.equal(result.success, true, 'original profile values are restored');
                },

                // 11. Sanity — the original password works again.
                async function verifyRestore(assert: IAssert, {$meta}: {$meta: IMeta}) {
                    const result = await loginTokenCreate<{access_token: string}>(
                        {username: 'testAdmin', password: 'testPassword'},
                        $meta,
                    );
                    assert.ok(
                        typeof result.access_token === 'string' && result.access_token.length > 0,
                        'login with the restored password succeeds',
                    );
                },
            ]),
    }),
);
