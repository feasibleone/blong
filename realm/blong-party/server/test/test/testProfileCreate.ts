import {type IAssert, type IMeta, handler} from '@feasibleone/blong';

/**
 * The actor id a token carries for a resource: crockford base32 over the uuid's bytes.
 *
 * `access.profile.edit` reads `$meta.auth.actorId` exactly as a request's token presents it, so a
 * flow that is not signing in has to encode the id the same way `sub` was encoded.
 */
const actorOf = (crockfordEncode: (bytes: Uint8Array) => string, userId: string): string =>
    crockfordEncode(new Uint8Array(Buffer.from(userId.replaceAll('-', ''), 'hex')));

/**
 * `test.profile.create` — the profile an account never had.
 *
 * A user whose profile was never filled in has a user node and no `hasProfile` edge, which is the
 * state every account seeded before the party realm existed is in. The self-service edit used to
 * drop the first name such a user typed; it now creates the person through `party.person.add` and
 * links it, and this is the flow that says so end to end — the names read back through
 * `access.profile.get`, the row through `party.person.get`, and the rule that a photograph on its
 * own creates nothing, because `party_person.firstName`/`lastName` are `NOT NULL`.
 *
 * Registered as the `test.profile.create` group (`integration.watch.test` in index.ts).
 */
export default handler(
    ({
        lib: {crockfordEncode, group},
        handler: {
            accessAccountAdd,
            accessProfileEdit,
            accessProfileGet,
            accessUserRemove,
            partyPersonGet,
        },
    }) => ({
        testProfileCreate: () =>
            group('profile create')([
                /**
                 * An account with no person: `access.account.add` writes the user, the credential
                 * and the role, and links nothing — which is exactly the state this flow is about.
                 */
                async function accountWithoutProfile(assert: IAssert, {$meta}: {$meta: IMeta}) {
                    const email = `no-profile.${Date.now()}@example.com`;
                    const {userId} = await accessAccountAdd<{userId: string}>(
                        {name: email, emailAddress: email, roles: 'Guest'},
                        $meta,
                    );
                    assert.ok(userId, 'an account exists with no profile');
                    // The actor as a token carries it: the handler decodes crockford base32, which
                    // is what `sub` is (`crockfordEncode` reverses the bytes the graph keeps).
                    const actorId = actorOf(crockfordEncode, userId);
                    const before = await accessProfileGet<{person: unknown}>(
                        {},
                        {...$meta, auth: {actorId}},
                    );
                    assert.equal(before.person, null, 'and reads back with no person');
                    return {userId, actorId};
                },

                /** The first name the user types creates the person, and the edge with it. */
                async function theFirstEditCreatesThePerson(
                    assert: IAssert,
                    {
                        $meta,
                        accountWithoutProfile,
                    }: {
                        $meta: IMeta;
                        accountWithoutProfile: Awaited<{userId: string; actorId: string}>;
                    },
                ) {
                    const {userId, actorId} = await accountWithoutProfile;
                    const full = {
                        firstName: 'Nina',
                        middleName: 'P',
                        lastName: 'Newcomer',
                        photoUrl: 'blob://party/01j9zz-profile-create',
                    };
                    const edited = await accessProfileEdit<{success: boolean}>(full, {
                        ...$meta,
                        auth: {actorId},
                    });
                    assert.equal(
                        edited.success,
                        true,
                        'the edit succeeds on an account with no person',
                    );

                    const after = await accessProfileGet<{
                        person: {
                            personId: string;
                            firstName: string;
                            lastName: string;
                            photoUrl: string | null;
                        } | null;
                    }>({}, {...$meta, auth: {actorId}});
                    assert.ok(after.person, 'and the profile now carries a person');
                    assert.equal(
                        after.person?.firstName,
                        full.firstName,
                        'with the first name it was given',
                    );
                    assert.equal(after.person?.photoUrl, full.photoUrl, 'and the photograph');

                    // The party's own record, which is where the label every list reads lives: the
                    // resource name of a person is its full name (`@@D-602`).
                    const person = await partyPersonGet<{person: {personName: string}}>(
                        {personId: after.person!.personId},
                        $meta,
                    );
                    assert.equal(
                        person.person.personName,
                        'Nina P Newcomer',
                        'the created person is labelled with the full name it was built from',
                    );
                    return {userId, personId: after.person!.personId};
                },

                /** And the next edit updates that person rather than creating a second one. */
                async function aLaterEditUpdatesTheSamePerson(
                    assert: IAssert,
                    {
                        $meta,
                        theFirstEditCreatesThePerson,
                    }: {
                        $meta: IMeta;
                        theFirstEditCreatesThePerson: Awaited<{userId: string; personId: string}>;
                    },
                ) {
                    const {userId, personId} = await theFirstEditCreatesThePerson;
                    const actorId = actorOf(crockfordEncode, userId);
                    await accessProfileEdit<{success: boolean}>(
                        {lastName: 'Returning', photoUrl: null},
                        {...$meta, auth: {actorId}},
                    );
                    const after = await accessProfileGet<{
                        person: {
                            personId: string;
                            firstName: string;
                            lastName: string;
                            photoUrl: string | null;
                        };
                    }>({}, {...$meta, auth: {actorId}});
                    assert.equal(
                        after.person.personId,
                        personId,
                        'the profile keeps the person it was given',
                    );
                    assert.equal(after.person.lastName, 'Returning', 'and takes the new name');
                    assert.equal(after.person.photoUrl, null, 'and the cleared photograph');

                    // The label every list and ACL target reads is the full name, and a rename has to
                    // compose it again — a person listed under a name they no longer have is what a
                    // stale `personName` looks like (`@@D-602`, T-694).
                    const person = await partyPersonGet<{person: {personName: string}}>(
                        {personId},
                        $meta,
                    );
                    assert.equal(
                        person.person.personName,
                        'Nina P Returning',
                        'the label follows the names it is built from',
                    );
                    return {userId};
                },

                /**
                 * Clearing a name is refused, because the row cannot hold a person without it.
                 *
                 * The profile page sends an emptied field as `null`, and `party_person.firstName` and
                 * `lastName` are `NOT NULL`, so this used to reach the database as a constraint error
                 * — a 500 where the caller needed to be told what was wrong (T-694).
                 */
                async function aClearedNameIsRefused(
                    assert: IAssert,
                    {
                        $meta,
                        theFirstEditCreatesThePerson,
                    }: {
                        $meta: IMeta;
                        theFirstEditCreatesThePerson: Awaited<{userId: string; personId: string}>;
                    },
                ) {
                    const {userId} = await theFirstEditCreatesThePerson;
                    const actorId = actorOf(crockfordEncode, userId);
                    for (const clear of [{firstName: null}, {lastName: null}]) {
                        let refused: {message?: string} | undefined;
                        try {
                            // `await` on the proxy's answer whatever its shape: a handler may answer
                            // synchronously, and only the rejection is wanted here.
                            await accessProfileEdit<{success: boolean}>(clear, {
                                ...$meta,
                                auth: {actorId},
                            });
                        } catch (error) {
                            refused = error as {message?: string};
                        }
                        assert.ok(
                            refused,
                            `clearing ${Object.keys(clear)[0]} is refused rather than stored`,
                        );
                        assert.match(
                            String(refused?.message),
                            /first and a last name/,
                            'and the refusal says what the profile needs',
                        );
                    }
                    // And the person is untouched by the refusals.
                    const after = await accessProfileGet<{person: {lastName: string} | null}>(
                        {},
                        {...$meta, auth: {actorId}},
                    );
                    assert.equal(
                        after.person?.lastName,
                        'Returning',
                        'the refused edit stored nothing',
                    );
                    return {userId};
                },

                /**
                 * The rule the row imposes: no first and last name, no person.
                 *
                 * A photograph alone cannot create one — the columns are `NOT NULL` — so the edit
                 * succeeds and stores nothing, which is the documented silence a suite without the
                 * party realm gets for every field.
                 */
                async function aPhotographAloneCreatesNothing(
                    assert: IAssert,
                    {$meta}: {$meta: IMeta},
                ) {
                    const email = `no-name.${Date.now()}@example.com`;
                    const {userId} = await accessAccountAdd<{userId: string}>(
                        {name: email, emailAddress: email, roles: 'Guest'},
                        $meta,
                    );
                    const edited = await accessProfileEdit<{success: boolean}>(
                        {photoUrl: 'blob://party/01j9zz-photo-only'},
                        {...$meta, auth: {actorId: actorOf(crockfordEncode, userId)}},
                    );
                    assert.equal(edited.success, true, 'the edit still succeeds');
                    const after = await accessProfileGet<{person: unknown}>(
                        {},
                        {...$meta, auth: {actorId: actorOf(crockfordEncode, userId)}},
                    );
                    assert.equal(
                        after.person,
                        null,
                        'and no person is invented to hold a photograph',
                    );
                    return {userId};
                },

                /** The accounts this flow made are the test's to take back. */
                async function cleanup(
                    assert: IAssert,
                    {
                        $meta,
                        aLaterEditUpdatesTheSamePerson,
                        aPhotographAloneCreatesNothing,
                    }: {
                        $meta: IMeta;
                        aLaterEditUpdatesTheSamePerson: Awaited<{userId: string}>;
                        aPhotographAloneCreatesNothing: Awaited<{userId: string}>;
                    },
                ) {
                    for (const {userId} of [
                        await aLaterEditUpdatesTheSamePerson,
                        await aPhotographAloneCreatesNothing,
                    ]) {
                        const removed = await accessUserRemove<{success: boolean}>({userId}, $meta);
                        assert.equal(removed.success, true, 'the test account is removed again');
                    }
                },
            ]),
    }),
);
