import {type IAssert, type IMeta, handler} from '@feasibleone/blong';

/**
 * Extract the HTTP status code from an error thrown by the handler proxy
 * (JSON-RPC codec or MLE errorReceive path).
 */
function getHttpStatus(err: unknown): number | undefined {
    const e = err as Record<string, unknown>;
    return (
        ((e.res as Record<string, unknown>)?.statusCode as number | undefined) ??
        (e.statusCode as number | undefined) ??
        ((e.params as Record<string, unknown>)?.code as number | undefined)
    );
}

/**
 * Browser-side (HTTP) test flow for self-registration + Google social login.
 *
 * Steps are chained so they run sequentially (the browser test client shares a
 * session token — parallel steps would race on it):
 *   1. registerHttp      — public registration endpoint → 200
 *   2. duplicateHttp     — duplicate email → 4xx
 *   3. guestLogin        — login as the new user
 *   4. guestActionHttp   — Guest calls accessTestGuest → 200
 *   5. privateDeniedHttp — Guest calls admin-only accessTestPrivate → 403
 *   6. profileHttp       — Guest reads own profile (email + linked person)
 *   7. googleHttp        — login.token.exchange auto-registers → 200 + isNewUser
 */
export default handler(
    ({
        lib: {group},
        handler: {
            accessRegistrationAdd,
            loginTokenCreate,
            accessTestGuest,
            accessTestPrivate,
            accessProfileGet,
            loginTokenExchange,
        },
    }) => ({
        testRegistrationFlow: ({name = 'registration flow browser'}: {name?: string} = {}) =>
            group(name)([
                // 1. Public self-registration endpoint → 200
                async function registerHttp(assert: IAssert, {$meta}: {$meta: IMeta}) {
                    const email = `guest.http.${Date.now()}@example.com`;
                    const result = await accessRegistrationAdd<{
                        userId: string;
                        emailAddress: string;
                    }>(
                        {
                            emailAddress: email,
                            password: 'testPassword',
                            firstName: 'Http',
                            lastName: 'Guest',
                        },
                        $meta,
                    );
                    assert.ok(result.userId, 'HTTP registration returns a userId');
                    assert.equal(result.emailAddress, email, 'HTTP registration returns the email');
                    return {email, password: 'testPassword'};
                },

                // 2. Duplicate email → 4xx
                async function duplicateHttp(
                    assert: IAssert,
                    {
                        registerHttp,
                        $meta,
                    }: {
                        registerHttp: Awaited<{email: string; password: string}>;
                        $meta: IMeta;
                    },
                ) {
                    const {email, password} = await registerHttp;
                    try {
                        await accessRegistrationAdd(
                            {
                                emailAddress: email,
                                password,
                                firstName: 'Http',
                                lastName: 'Guest',
                            },
                            $meta,
                        );
                        assert.fail('Duplicate HTTP registration should have thrown');
                    } catch (err: unknown) {
                        const status = getHttpStatus(err);
                        assert.ok(
                            status !== undefined && status >= 400,
                            `Duplicate registration returns an HTTP error status (${status})`,
                        );
                    }
                    // Hand the credentials to the next step (guestLogin)
                    return {email, password};
                },

                // 3. Login as the newly registered user
                async function guestLogin(
                    assert: IAssert,
                    {
                        duplicateHttp,
                        $meta,
                    }: {
                        duplicateHttp: Awaited<{email: string; password: string}>;
                        $meta: IMeta;
                    },
                ) {
                    const {email, password} = await duplicateHttp;
                    const result = await loginTokenCreate<{
                        access_token: string;
                        permissions: string[];
                    }>({username: email, password}, $meta);
                    assert.ok(result.access_token?.length > 0, 'New user logs in over HTTP');
                    return result;
                },

                // 4. Guest can call the guest action over HTTP → 200
                async function guestActionHttp(
                    assert: IAssert,
                    {
                        guestLogin,
                        $meta,
                    }: {
                        guestLogin: Awaited<{access_token: string}>;
                        $meta: IMeta;
                    },
                ) {
                    await guestLogin;
                    const result = await accessTestGuest<{success: boolean}>({}, $meta);
                    assert.equal(result.success, true, 'Guest can call accessTestGuest over HTTP');
                },

                // 5. Guest denied the admin-only action → 403
                async function privateDeniedHttp(
                    assert: IAssert,
                    {
                        guestActionHttp,
                        $meta,
                    }: {
                        guestActionHttp: Awaited<unknown>;
                        $meta: IMeta;
                    },
                ) {
                    await guestActionHttp;
                    try {
                        await accessTestPrivate({}, $meta);
                        assert.fail('Guest should not be able to call accessTestPrivate');
                    } catch (err: unknown) {
                        const status = getHttpStatus(err);
                        assert.equal(status, 403, 'Guest gets HTTP 403 on the admin-only action');
                    }
                },

                // 6. Guest reads own profile (email + linked person) → 200
                async function profileHttp(
                    assert: IAssert,
                    {
                        privateDeniedHttp,
                        registerHttp,
                        $meta,
                    }: {
                        privateDeniedHttp: Awaited<unknown>;
                        registerHttp: Awaited<{email: string; password: string}>;
                        $meta: IMeta;
                    },
                ) {
                    await privateDeniedHttp;
                    const {email, password} = await registerHttp;
                    await loginTokenCreate({username: email, password}, $meta);
                    const profile = await accessProfileGet<{
                        emailAddress: string | null;
                        person: {firstName: string; lastName: string} | null;
                    }>({}, $meta);
                    assert.equal(profile.emailAddress, email, 'Profile returns the user email');
                    assert.ok(profile.person, 'Profile returns the linked person');
                    assert.equal(profile.person?.firstName, 'Http', 'Person first name matches');
                },

                // 7. Google social login over HTTP → token + Guest rights
                // The server-side flow in the same process already auto-registered
                // the single mock Google identity, so isNewUser depends on execution
                // order.  Assert the flag is reported and the account maps to a Guest.
                async function googleHttp(
                    assert: IAssert,
                    {
                        profileHttp,
                        $meta,
                    }: {
                        profileHttp: Awaited<unknown>;
                        $meta: IMeta;
                    },
                ) {
                    await profileHttp;
                    const result = await loginTokenExchange<{
                        access_token: string;
                        isNewUser?: boolean;
                        permissions?: string[];
                    }>({provider: 'google', code: 'mock-google-code'}, $meta);
                    assert.ok(result.access_token?.length > 0, 'Google exchange returns a token');
                    assert.equal(
                        typeof result.isNewUser,
                        'boolean',
                        'Google exchange reports isNewUser',
                    );
                    assert.ok(
                        result.permissions?.includes('accessTestGuest'),
                        'Google account maps to a Guest with the guest action',
                    );
                },

                // 8. Google social login via the plain OAuth flow over HTTP → same Guest rights
                async function googleOAuthHttp(
                    assert: IAssert,
                    {
                        googleHttp,
                        $meta,
                    }: {
                        googleHttp: Awaited<unknown>;
                        $meta: IMeta;
                    },
                ) {
                    await googleHttp;
                    const result = await loginTokenExchange<{
                        access_token: string;
                        isNewUser?: boolean;
                        permissions?: string[];
                    }>({provider: 'google', code: 'mock-google-code', flow: 'oauth'}, $meta);
                    assert.ok(result.access_token?.length > 0, 'Google OAuth exchange returns a token');
                    assert.equal(
                        typeof result.isNewUser,
                        'boolean',
                        'Google OAuth exchange reports isNewUser',
                    );
                    assert.ok(
                        result.permissions?.includes('accessTestGuest'),
                        'Google OAuth account maps to a Guest with the guest action',
                    );
                },
            ]),
    }),
);
