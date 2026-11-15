import {type IAssert, type IMeta, handler} from '@feasibleone/blong';

/** A `find` result is a plain array through the adapter — tolerate the wrapped shape too. */
function rowsOf(result: unknown): Array<Record<string, unknown>> {
    if (Array.isArray(result)) return result as Array<Record<string, unknown>>;
    const items = (result as {items?: unknown} | undefined)?.items;
    return Array.isArray(items) ? (items as Array<Record<string, unknown>>) : [];
}

/** The `sub` claim a login answers, which is the actor every handler reads. */
function actorOf(token: string): string {
    return JSON.parse(Buffer.from(token.split('.')[1]!, 'base64url').toString())['sub'] as string;
}

const stamp = () => `${Date.now()}`.slice(-6);

/**
 * `test.scope` — the club and federation scopes an athlete holds.
 *
 * The fixture is built by the run itself: a federation, a club and an athlete whose profile names
 * both, so the assertion is about the walk the handler makes rather than about a seed that could
 * agree with it by accident. The person id is the profile's own key (`@@D-595`), which is why the
 * system call can name it without an account.
 *
 * The two refusals are the cases that keep a club's assets shut: a caller with a person and no sport
 * profile holds only the person token, and a call that names nobody holds nothing at all.
 *
 * Registered as the `test.scope` group (`integration.watch.test` in index.ts).
 */
export default handler(
    ({
        lib: {group},
        handler: {
            loginTokenCreate,
            sportAthleteAdd,
            sportClubAdd,
            sportFederationAdd,
            sportScopeGrant,
            sportSportFind,
        },
    }) => ({
        testScope: () =>
            group('scope')([
                async function login(assert: IAssert, {$meta}: {$meta: IMeta}) {
                    const result = await loginTokenCreate<{access_token: string}>(
                        {username: 'testAdmin', password: 'testPassword'},
                        $meta,
                    );
                    const actorId = actorOf(result.access_token);
                    assert.ok(actorId, 'the fixture account signs in');
                    return {actorId};
                },

                async function profile(assert: IAssert, {$meta}: {$meta: IMeta}) {
                    const system = {...$meta, auth: undefined};
                    const sports = rowsOf(
                        await sportSportFind<unknown>(
                            {paging: {pageNumber: 1, pageSize: 1}},
                            {...system, method: 'sport.sport.find'},
                        ),
                    );
                    assert.ok(sports.length >= 1, 'the nomenclature seed holds a sport');
                    const sportId = sports[0]!['sportId'] as string;

                    const tag = stamp();
                    const federation = (await sportFederationAdd<{
                        federation: {federationId: string};
                    }>(
                        {
                            federation: {
                                legalName: `Scope Federation ${tag}`,
                                federationShortName: `SF${tag}`,
                                federationStatus: 'active',
                                sportId,
                            },
                        },
                        {...system, method: 'sport.federation.add'},
                    )) as unknown as {federation: {federationId: string}};
                    const club = (await sportClubAdd<{club: {clubId: string}}>(
                        {
                            club: {
                                legalName: `Scope Club ${tag}`,
                                clubShortName: `SC${tag}`,
                                clubStatus: 'active',
                                sportId,
                            },
                        },
                        {...system, method: 'sport.club.add'},
                    )) as unknown as {club: {clubId: string}};
                    const athlete = (await sportAthleteAdd<{athlete: {athleteId: string}}>(
                        {
                            athlete: {
                                personName: `Scope Athlete ${tag}`,
                                firstName: 'Scope',
                                lastName: `Athlete${tag}`,
                                athleteStatus: 'active',
                                currentClubId: club.club.clubId,
                                currentFederationId: federation.federation.federationId,
                            },
                        },
                        {...system, method: 'sport.athlete.add'},
                    )) as unknown as {athlete: {athleteId: string}};
                    return {
                        federation: federation.federation.federationId,
                        club: club.club.clubId,
                        athlete: athlete.athlete.athleteId,
                    };
                },

                async function scopes(
                    assert: IAssert,
                    {$meta, profile}: {$meta: IMeta; profile: Promise<Record<string, string>>},
                ) {
                    const {federation, club, athlete} = await profile;
                    const answer = (await sportScopeGrant(
                        {personId: athlete},
                        {...$meta, auth: undefined} as IMeta,
                    )) as {scopes: string[]};
                    assert.deepEqual(
                        answer.scopes,
                        [
                            `party:person:${athlete}`,
                            `sport:club:${club}`,
                            `sport:federation:${federation}`,
                        ].sort(),
                        'the person, the club it plays for and that club’s federation',
                    );
                    return {scopes: answer.scopes};
                },

                async function noProfileNoScopes(
                    assert: IAssert,
                    {
                        $meta,
                        login,
                        profile,
                    }: {
                        $meta: IMeta;
                        login: Promise<{actorId: string}>;
                        profile: Promise<Record<string, string>>;
                    },
                ) {
                    const {actorId} = await login;
                    const {athlete} = await profile;
                    const answer = (await sportScopeGrant(
                        {},
                        {...$meta, auth: {actorId}} as unknown as IMeta,
                    )) as {scopes: string[]};
                    assert.equal(
                        answer.scopes.length,
                        1,
                        'an account with no sport profile holds no club or federation',
                    );
                    assert.match(
                        answer.scopes[0]!,
                        /^party:person:/,
                        'and nothing beyond its own person token',
                    );

                    const nobody = (await sportScopeGrant(
                        {},
                        {...$meta, auth: undefined} as IMeta,
                    )) as {scopes: string[]};
                    assert.deepEqual(nobody.scopes, [], 'and a call that names nobody holds nothing');

                    const stranger = Buffer.alloc(16, 7).toString('base64');
                    const unknown = (await sportScopeGrant(
                        {personId: stranger},
                        {...$meta, auth: undefined} as IMeta,
                    )) as {scopes: string[]};
                    assert.deepEqual(unknown.scopes, [], 'an unknown person holds nothing either');
                    assert.ok(athlete, 'the fixture athlete exists to be asked about');
                    return {done: true};
                },
            ]),
    }),
);
