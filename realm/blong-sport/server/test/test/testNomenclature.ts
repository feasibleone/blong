/* eslint-disable @typescript-eslint/no-explicit-any -- the seed and find payloads
   are flat records whose keys the seed file owns; the steps are typed loosely on
   purpose, as in `testAthlete.ts`. */
import {type IAssert, type IMeta, handler} from '@feasibleone/blong';

/**
 * server/test/test/testNomenclature.ts — the classifier seed and the cascade.
 *
 * What this proves:
 *
 * 1. `sport.nomenclature.merge` reads the short seed shape — a padded table for
 *    the sports and a name-per-line block grouped by sport for the disciplines —
 *    and fills what the file leaves out: the resource label and the
 *    international name from the name, the kind, the status, and the sex read
 *    from the discipline name. @@D-788
 * 2. A discipline carries the id its sport's name resolved to, so the reference
 *    is a name in the file and a key in the table.
 * 3. `sport.register.merge` reads `key: value` lines, splits a person's name,
 *    writes the party row and the profile row under one id, and resolves the
 *    sport, discipline and federation references. @@D-788
 * 4. `sport.dropdown.list` carries the parent key on the discipline options,
 *    which is what the form-level cascade filters on. @@D-789
 *
 * Registered as the `test.nomenclature` group (`integration.watch.test` in
 * `index.ts`). Every name carries a run stamp, so a dev database that already
 * holds the production seeds keeps them and a second run merges into its own
 * rows.
 */
export default handler(
    ({
        lib: {group},
        handler: {
            loginTokenCreate,
            partyPersonGet,
            sportAthleteFind,
            sportDisciplineFind,
            sportDropdownList,
            sportNomenclatureMerge,
            sportRegisterMerge,
            sportSportFind,
        },
    }) => ({
        testNomenclature: ({name = 'sport nomenclature seed'}: {name?: string} = {}) =>
            group(name)([
                // 1. The short shapes, and the defaults they rely on.
                async function seedClassifier(assert: IAssert, {$meta}: {$meta: IMeta}) {
                    await loginTokenCreate({username: 'testAdmin', password: 'testPassword'}, $meta);
                    const stamp = `SEED${Date.now()}`;
                    const sport = `${stamp} Sport`;
                    const result = await sportNomenclatureMerge<{
                        sport: number;
                        discipline: number;
                    }>(
                        {
                            sport: `| name | code |\n| --- | --- |\n| ${sport} | SDS |`,
                            discipline: {
                                [sport]: [
                                    `Men ${stamp} 10 m`,
                                    `Women ${stamp} 10 m`,
                                    `Mixed ${stamp} Relay, kind: team`,
                                ].join('\n'),
                            },
                        },
                        $meta,
                    );
                    assert.equal(result.sport, 1, 'the sport was written');
                    assert.equal(result.discipline, 3, 'the disciplines were written');

                    const [row] = await sportSportFind<Array<Record<string, any>>>(
                        {
                            paging: {pageNumber: 1, pageSize: 10},
                            filterBy: {sportName: sport},
                        },
                        $meta,
                    );
                    assert.ok(row?.sportId, 'the sport is readable');
                    assert.equal(row.sportName, sport, 'the name became the label');
                    assert.equal(row.sportIntlName, sport, 'the name became the intl name');
                    assert.equal(row.sportCode, 'SDS', 'the short key became the column');
                    assert.equal(row.sportKind, 'olympic', 'the kind defaulted');
                    assert.equal(row.sportStatus, 'active', 'the status defaulted');

                    const rows = await sportDisciplineFind<Array<Record<string, any>>>(
                        {
                            paging: {pageNumber: 1, pageSize: 20},
                            filterBy: {sportId: row.sportId},
                        },
                        $meta,
                    );
                    const byName = new Map(rows.map(entry => [entry.disciplineName, entry]));
                    assert.equal(rows.length, 3, 'the disciplines point at the sport');
                    assert.equal(
                        byName.get(`Men ${stamp} 10 m`)?.disciplineSex,
                        'male',
                        'the sex is read from the name',
                    );
                    assert.equal(
                        byName.get(`Women ${stamp} 10 m`)?.disciplineSex,
                        'female',
                        'the female event says so',
                    );
                    assert.equal(
                        byName.get(`Mixed ${stamp} Relay`)?.disciplineKind,
                        'team',
                        'the line overrode the kind',
                    );
                    return {stamp, sport, sportId: row.sportId};
                },

                // 2. The register halves: party id shared, classifier ids resolved.
                async function seedRegister(
                    assert: IAssert,
                    {$meta, seedClassifier: created}: {$meta: IMeta; seedClassifier: any},
                ) {
                    const {stamp, sport, sportId} = await created;
                    const result = await sportRegisterMerge<Record<string, number>>(
                        {
                            federation: [
                                `name: ${stamp} Federation, sport: ${sport}, eik: 000000001, register: T-1`,
                            ].join('\n'),
                            club: `name: ${stamp} Club, sport: ${sport}, eik: 000000002`,
                            athlete: [
                                `name: Тест ${stamp} Спортист`,
                                `sport: ${sport}`,
                                `discipline: Women ${stamp} 10 m`,
                                'sex: female',
                            ].join(', '),
                            coach: `name: Тест ${stamp} Треньор, sport: ${sport}, register: T-3, duty: треньор`,
                        },
                        $meta,
                    );
                    assert.equal(result.federation, 1, 'the federation was written');
                    assert.equal(result.club, 1, 'the club was written');
                    assert.equal(result.athlete, 1, 'the athlete was written');
                    assert.equal(result.coach, 1, 'the coach was written');

                    const [athlete] = await sportAthleteFind<Array<Record<string, any>>>(
                        {
                            paging: {pageNumber: 1, pageSize: 10},
                            filterBy: {athleteId: undefined, lastName: `Спортист`},
                        },
                        $meta,
                    );
                    assert.ok(athlete?.athleteId, 'the athlete is readable');
                    assert.equal(athlete.firstName, 'Тест', 'the name was split');
                    assert.equal(athlete.primarySportId, sportId, 'the sport was resolved');
                    assert.ok(athlete.primaryDisciplineId, 'the discipline was resolved');

                    // The profile's key *is* the person's: the register seed writes the
                    // party row first and the profile under the id it was given. @@D-595
                    const person = await partyPersonGet<Record<string, any>>(
                        {personId: athlete.athleteId},
                        $meta,
                    );
                    assert.equal(
                        (person?.person ?? person)?.personId,
                        athlete.athleteId,
                        'the athlete and the person share one id',
                    );
                    return created;
                },

                // 3. The picker carries the parent key the form cascade filters on.
                async function cascadeOptions(
                    assert: IAssert,
                    {$meta, seedClassifier: created}: {$meta: IMeta; seedClassifier: any},
                ) {
                    const {stamp, sportId} = await created;
                    const lists = await sportDropdownList<Record<string, Array<any>>>(
                        {names: []},
                        $meta,
                    );
                    const discipline = (lists['sport.discipline'] ?? []).find(
                        option => option.label === `Men ${stamp} 10 m`,
                    );
                    assert.ok(discipline, 'the discipline is in the picker');
                    assert.equal(discipline.sportId, sportId, 'the option carries its sport');
                },
            ]),
    }),
);
