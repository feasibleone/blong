import {type IAssert, type IMeta, handler} from '@feasibleone/blong';

/**
 * Server-side (tap) test flow for self-registration + Google social login.
 *
 * Steps are chained via dependencies so they run sequentially and
 * deterministically:
 *   1. registerUser          — access.registration.add creates user+credential+person
 *   2. keepPhotograph        — the person's photograph is a `blob://` reference
 *   3. registerDuplicate     — same email → error
 *   4. loginNewUser          — new user logs in via login.token.create
 *   5. guestPermissions      — Guest role grants guest action + self profile, not private
 *   6. guestAction           — accessTestGuest succeeds (direct handler call)
 *   7. googleExchange        — login.token.exchange auto-registers (isNewUser: true)
 *   8. googleSecondExchange  — same Google account maps to the same user (isNewUser: false)
 */
export default handler(
    ({
        lib: {group},
        handler: {
            accessRegistrationAdd,
            loginTokenCreate,
            accessTestGuest,
            loginTokenExchange,
            partyPersonEdit,
            partyPersonGet,
        },
    }) => ({
        testRegistrationFlow: ({name = 'registration flow'}: {name?: string} = {}) =>
            group(name)([
                // 1. Self-register a new Guest account + linked person
                async function registerUser(assert: IAssert, {$meta}: {$meta: IMeta}) {
                    const email = `guest.${Date.now()}@example.com`;
                    const result = await accessRegistrationAdd<{
                        userId: string;
                        personId: string;
                        emailAddress: string;
                    }>(
                        {
                            emailAddress: email,
                            password: 'testPassword',
                            firstName: 'Guest',
                            lastName: 'User',
                        },
                        $meta,
                    );
                    assert.ok(result.userId, 'Registration returns a userId');
                    assert.ok(result.personId, 'Registration returns a personId');
                    assert.equal(
                        result.emailAddress,
                        email,
                        'Email address is normalized (lowercased)',
                    );
                    return {email, password: 'testPassword', personId: result.personId};
                },

                // 2. The photograph is a reference, not bytes: the column keeps whatever the widget
                //    stored, so a `blob://` value survives a write and a read unchanged (@@D-842).
                async function keepPhotograph(
                    assert: IAssert,
                    {
                        registerUser: registration,
                        $meta,
                    }: {
                        registerUser: Promise<{personId: string}>;
                        $meta: IMeta;
                    },
                ) {
                    const {personId} = await registration;
                    const photoUrl = 'blob://party/01j8zk-photograph';
                    await partyPersonEdit({person: {personId, photoUrl}}, $meta);
                    const read = await partyPersonGet<{person: {photoUrl: string | null}}>(
                        {personId},
                        $meta,
                    );
                    assert.equal(
                        read.person.photoUrl,
                        photoUrl,
                        'the photograph is kept as the reference it was given',
                    );
                    return {personId, photoUrl};
                },

                // 3. Duplicate email must fail
                async function registerDuplicate(
                    assert: IAssert,
                    {
                        registerUser,
                        $meta,
                    }: {
                        registerUser: Awaited<{email: string; password: string}>;
                        $meta: IMeta;
                    },
                ) {
                    const {email, password} = await registerUser;
                    try {
                        // The duplicate is the case under test, so the refusal is
                        // declared: it is logged at debug instead of error.
                        await accessRegistrationAdd(
                            {
                                emailAddress: email,
                                password,
                                firstName: 'Guest',
                                lastName: 'User',
                            },
                            {...$meta, expect: 'account.exists'},
                        );
                        assert.fail('Duplicate registration should have thrown');
                    } catch (err: unknown) {
                        assert.ok(err, 'Duplicate registration throws an error');
                    }
                },

                // 4. New user logs in with their credentials
                async function loginNewUser(
                    assert: IAssert,
                    {
                        registerUser,
                        $meta,
                    }: {
                        registerUser: Awaited<{email: string; password: string}>;
                        $meta: IMeta;
                    },
                ) {
                    const {email, password} = await registerUser;
                    const result = await loginTokenCreate<{
                        access_token: string;
                        permissions: string[];
                    }>({username: email, password}, $meta);
                    assert.ok(result.access_token?.length > 0, 'New user logs in successfully');
                    return result;
                },

                // 5. Guest role grants guest action + self profile, not admin-only
                async function guestPermissions(
                    assert: IAssert,
                    {
                        loginNewUser,
                    }: {
                        loginNewUser: Awaited<{permissions: string[]}>;
                    },
                ) {
                    const t = await loginNewUser;
                    assert.ok(
                        t.permissions.includes('accessTestGuest'),
                        'Guest has the accessTestGuest action',
                    );
                    assert.ok(
                        t.permissions.includes('access.profile.get'),
                        'Guest has the access.profile.get action',
                    );
                    assert.ok(
                        !t.permissions.includes('accessTestPrivate'),
                        'Guest does NOT have the accessTestPrivate action',
                    );
                },

                // 6. Guest can call the guest action
                async function guestAction(assert: IAssert, {$meta}: {$meta: IMeta}) {
                    const result = await accessTestGuest<{success: boolean}>({}, $meta);
                    assert.equal(result.success, true, 'accessTestGuest succeeds for Guest');
                },

                // 7. Google social login auto-registers a new Guest account
                async function googleExchange(assert: IAssert, {$meta}: {$meta: IMeta}) {
                    const result = await loginTokenExchange<{
                        access_token: string;
                        isNewUser: boolean;
                        permissions: string[];
                    }>({provider: 'google', code: 'mock-google-code'}, $meta);
                    assert.ok(result.access_token?.length > 0, 'Google exchange returns a token');
                    assert.equal(result.isNewUser, true, 'First Google login is a new user');
                    assert.ok(
                        result.permissions.includes('accessTestGuest'),
                        'Auto-registered Google user has Guest access',
                    );
                    return result;
                },

                // 8. Second Google login maps to the same (already-linked) account —
                //    this time via the plain OAuth flow.
                async function googleSecondExchange(
                    assert: IAssert,
                    {
                        googleExchange,
                        $meta,
                    }: {
                        googleExchange: Awaited<{access_token: string}>;
                        $meta: IMeta;
                    },
                ) {
                    await googleExchange;
                    const result = await loginTokenExchange<{
                        access_token: string;
                        isNewUser: boolean;
                    }>({provider: 'google', code: 'mock-google-code', flow: 'oauth'}, $meta);
                    assert.equal(result.isNewUser, false, 'Second Google login is not a new user');
                    assert.ok(
                        result.access_token?.length > 0,
                        'Second Google login returns a token',
                    );
                },
            ]),
    }),
);
