/* eslint-disable @typescript-eslint/no-explicit-any -- the profile payload is a
   flat record whose keys the model owns; the step helpers are typed loosely on
   purpose. */
import {type IAssert, type IMeta, handler} from '@feasibleone/blong';

/**
 * server/test/test/testAthlete.ts — the shared-PK profile flow.
 *
 * What this proves, beyond "CRUD works":
 *
 * 1. `sport.athlete.add` creates **one** party person and one profile row under
 *    the same id — the profile table has no identity of its own. @@D-595
 * 2. `get` returns the flat projection, so the person's fields arrive with the
 *    profile's (@@D-596).
 * 3. `edit` writes both halves and never moves the id.
 * 4. `find` filters on a profile column and carries the person's fields.
 * 5. `find` and `get` project the label a column names (`labels`), so a table cell
 *    never has to look a key up. @@D-614
 *
 * Registered as the `test.athlete` group (`integration.watch.test` in index.ts).
 */
export default handler(
    ({
        lib: {group},
        handler: {
            loginTokenCreate,
            partyPersonGet,
            sportAthleteAdd,
            sportAthleteEdit,
            sportAthleteFind,
            sportAthleteGet,
            sportCompetitionAdd,
            sportCompetitionFind,
            sportCompetitionGet,
            sportCompetitionRemove,
            sportSportFind,
        },
    }) => ({
        testAthlete: ({name = 'sport athlete profile'}: {name?: string} = {}) =>
            group(name)([
                // 1. Authenticate via blong-access and verify the permission map.
                async function login(assert: IAssert, {$meta}: {$meta: IMeta}) {
                    const result = await loginTokenCreate<{
                        access_token: string;
                        permissions: string[];
                    }>({username: 'testAdmin', password: 'testPassword'}, $meta);
                    assert.ok(
                        typeof result.access_token === 'string' && result.access_token.length > 0,
                        'login returns a non-empty access token',
                    );
                    // The map carries the action *resource names* the seed declares, not
                    // handler names: `accessPermissionList` reads `core_resource.resourceName`
                    // for the caller's `access.effectiveAction` paths, and the RBAC seed
                    // writes the dotted method (`sport.athlete.add`). The gateway normalises
                    // to `methodId` form only when it authorizes a route
                    // (`accessAuthorizationList`), so the handler name `sportAthleteAdd` never
                    // appears in this list.
                    assert.ok(
                        result.permissions.includes('sport.athlete.add'),
                        'testAdmin permission map includes the sport.athlete.add action',
                    );
                    return result;
                },

                // 2. Create an athlete: the person is created by party, the
                // profile row is created under the same id.
                async function addAthlete(assert: IAssert, {$meta}: {$meta: IMeta}) {
                    const personName = `Test Athlete ${Date.now()}`;
                    const result = await sportAthleteAdd<{
                        athlete: {athleteId: string; athleteStatus: string; personName: string};
                    }>(
                        {
                            athlete: {
                                personName,
                                firstName: 'Test',
                                lastName: 'Athlete',
                                gender: 'female',
                                nationality: 'BG',
                                athleteStatus: 'active',
                                careerStartDate: '2015-01-01',
                            },
                        },
                        $meta,
                    );
                    assert.ok(result.athlete.athleteId, 'athlete add returns an id');
                    assert.equal(result.athlete.athleteStatus, 'active', 'profile row created');
                    return {...result.athlete, personName};
                },

                // 3. The person exists exactly once, under the profile's id.
                async function personCreated(
                    assert: IAssert,
                    {$meta, addAthlete: created}: {$meta: IMeta; addAthlete: any},
                ) {
                    const athlete = await created;
                    const person = await partyPersonGet<{
                        person: {personId: string; firstName: string; lastName: string};
                    }>({personId: athlete.athleteId}, $meta);
                    assert.equal(
                        person.person.firstName,
                        'Test',
                        'person created with the profile',
                    );
                    assert.equal(
                        person.person.personId,
                        athlete.athleteId,
                        'the profile id IS the person id',
                    );
                    return athlete;
                },

                // 4. Get returns the flat projection.
                async function getAthlete(
                    assert: IAssert,
                    {$meta, addAthlete: created}: {$meta: IMeta; addAthlete: any},
                ) {
                    const athlete = await created;
                    const {athlete: row} = await sportAthleteGet<{athlete: Record<string, any>}>(
                        {athleteId: athlete.athleteId},
                        $meta,
                    );
                    assert.equal(row.firstName, 'Test', 'projection carries the person fields');
                    assert.equal(
                        row.athleteStatus,
                        'active',
                        'projection carries the profile fields',
                    );
                    return athlete;
                },

                // 5. Edit writes both halves and keeps the id.
                async function editAthlete(
                    assert: IAssert,
                    {$meta, addAthlete: created}: {$meta: IMeta; addAthlete: any},
                ) {
                    const athlete = await created;
                    const result = await sportAthleteEdit<{athlete: {athleteId: string}}>(
                        {
                            athlete: {
                                athleteId: athlete.athleteId,
                                firstName: 'Edited',
                                athleteStatus: 'retired',
                                careerEndDate: '2024-12-31',
                            },
                        },
                        $meta,
                    );
                    assert.equal(result.athlete.athleteId, athlete.athleteId, 'id is stable');

                    const {athlete: row} = await sportAthleteGet<{athlete: Record<string, any>}>(
                        {athleteId: athlete.athleteId},
                        $meta,
                    );
                    assert.equal(row.firstName, 'Edited', 'person half updated');
                    assert.equal(row.athleteStatus, 'retired', 'profile half updated');
                    return athlete;
                },

                // 6. Find filters on a profile column and carries the person half.
                async function findAthlete(
                    assert: IAssert,
                    {$meta, addAthlete: created}: {$meta: IMeta; addAthlete: any},
                ) {
                    const athlete = await created;
                    const rows = await sportAthleteFind<Array<Record<string, any>>>(
                        {
                            paging: {pageNumber: 1, pageSize: 10},
                            filterBy: {athleteId: athlete.athleteId},
                        },
                        $meta,
                    );
                    assert.equal(rows.length, 1, 'find returns the created athlete');
                    assert.equal(rows[0].lastName, 'Athlete', 'find carries the person fields');
                    return rows;
                },

                // 7. A column that names a label reads it from the same round trip.
                async function labelProjection(assert: IAssert, {$meta}: {$meta: IMeta}) {
                    const [sport] = await sportSportFind<Array<Record<string, any>>>(
                        {
                            paging: {pageNumber: 1, pageSize: 1},
                            filterBy: {sportName: 'Athletics'},
                        },
                        $meta,
                    );
                    assert.ok(sport?.sportId, 'the sport seed is present');
                    // The name this call creates, kept so the filter below can name the row
                    // it is about: a dev database keeps every competition an earlier run
                    // added, and a page of five rows in no order would leave this one out
                    // once Athletics holds more than five.
                    const competitionName = `Label Projection ${Date.now()}`;
                    const added = await sportCompetitionAdd<{competition: {competitionId: string}}>(
                        {
                            competition: {
                                // `type.uuid()` is submitted as its literal placeholder
                                // marker; the adapter mints the real key from it.
                                competitionId: 'uuid',
                                competitionName,
                                competitionKind: 'olympicGames',
                                competitionStatus: 'active',
                                sportId: sport.sportId,
                            },
                        },
                        $meta,
                    );
                    const competitionId = added.competition.competitionId;
                    try {
                        const [row] = await sportCompetitionFind<Array<Record<string, any>>>(
                            {
                                paging: {pageNumber: 1, pageSize: 1},
                                filterBy: {competitionId},
                                labels: ['sportName'],
                            },
                            $meta,
                        );
                        assert.equal(
                            row?.sportName,
                            'Athletics',
                            'find projects the joined label beside the key',
                        );
                        assert.ok(row?.sportId, 'find still returns the key itself');
                        // Filtering on the key while the label join is in the statement:
                        // the key exists on both tables, so an unqualified reference
                        // would be ambiguous.
                        const filtered = await sportCompetitionFind<Array<Record<string, any>>>(
                            {
                                paging: {pageNumber: 1, pageSize: 5},
                                filterBy: {sportId: sport.sportId, competitionName},
                                labels: ['sportName'],
                            },
                            $meta,
                        );
                        assert.ok(
                            filtered.some(r => r.competitionId === competitionId),
                            'find filters on a key that a label join also joins',
                        );
                        const got = await sportCompetitionGet<{
                            competition: Record<string, any>;
                        }>({competitionId, labels: ['sportName']}, $meta);
                        assert.equal(
                            got.competition.sportName,
                            'Athletics',
                            'get projects the joined label beside the key',
                        );
                        const unlabelled = await sportCompetitionGet<{
                            competition: Record<string, any>;
                        }>({competitionId}, $meta);
                        assert.equal(
                            unlabelled.competition.sportName,
                            undefined,
                            'without the request no extra column is read',
                        );
                        const unknown = await sportCompetitionFind<Array<Record<string, any>>>(
                            {
                                paging: {pageNumber: 1, pageSize: 1},
                                filterBy: {competitionId},
                                labels: ['notAForeignKeyName'],
                            },
                            $meta,
                        );
                        assert.equal(
                            unknown[0]?.notAForeignKeyName,
                            undefined,
                            'a label that names no foreign key projects nothing',
                        );
                    } finally {
                        await sportCompetitionRemove({competitionId}, $meta);
                    }
                },
            ]),
    }),
);
