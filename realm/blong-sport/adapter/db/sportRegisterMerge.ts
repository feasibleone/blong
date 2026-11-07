/* eslint-disable @typescript-eslint/no-explicit-any -- the knex builder and the
   seed payload are untyped here, as in the rest of the adapter's db group. */
import {type IMeta, handler} from '@feasibleone/blong';

type KnexQb = any;
type SeedRow = Record<string, unknown>;

/** The party columns of a person and of an organisation. */
const PERSON_COLUMNS = [
    'firstName',
    'middleName',
    'lastName',
    'internationalName',
    'birthDate',
    'gender',
    'nationality',
    'citizenship',
    'photoUrl',
    'notes',
];

const ORGANISATION_COLUMNS = [
    'legalName',
    'tradingName',
    'registrationNumber',
    'taxId',
    'establishedDate',
    'industry',
    'website',
    'notes',
];

/**
 * `sport.register.merge` — the Bulgarian register data: federations, clubs,
 * athletes and coaches, with every reference resolved by name.
 *
 * A federation and a club are `party.organization` rows extended by
 * `sport.federation` / `sport.club`; an athlete and a coach are `party.person`
 * rows extended by their profile table. Both halves are written by the generic
 * `merge` of the shared adapter, and this handler is what joins them: the
 * profile row takes the id the party row was given, and the sport, discipline
 * and federation columns take the ids their names resolve to. @@D-788
 *
 * A section is written in the short form — a table with a header, or one line of
 * `key: value` pairs per record — and the handler reads the register's own
 * vocabulary:
 *
 * ```yaml
 * federation: |
 *     | name                       | sport  | eik       | register | site              |
 *     | Българска федерация по бокс | Boxing | 121341855 | 144-000  | https://bgboxing.org/ |
 * ```
 *
 * `eik` is the registration number, `register` the register entry,
 * `site` the website, `member` the federation a club belongs to, `duty` the
 * coach's position and `born` a birth date. What the register does not carry is
 * filled in: an organisation is labelled with its legal name, a person's name is
 * split into first, middle and last (`Име Бащино Фамилия`), a status defaults to
 * `active`, and a person defaults to Bulgarian nationality and citizenship. The
 * explicit column names keep working and always win.
 *
 * Wire: `sport.register.merge`, dispatched from
 * `meta/db/2-sportRegisterMerge.yaml` after the nomenclature seed, which is what
 * makes the sport and discipline names resolvable.
 */
export default handler(({lib: {seedRef, seedReference, seedRows}}) => {
    const parse = (input: unknown): SeedRow[] => seedRows(input) as SeedRow[];
    const text = (value: unknown): string | undefined =>
        value === undefined || value === null || value === '' ? undefined : String(value);

    /** First, middle and last name from the register's single `name` column. */
    function personNames(row: SeedRow): {
        firstName?: string;
        middleName?: string;
        lastName?: string;
    } {
        const whole = text(row.name);
        const parts = whole ? whole.split(' ') : [];
        return {
            firstName: text(row.firstName) ?? parts[0],
            middleName:
                text(row.middleName) ??
                (parts.length > 2 ? parts.slice(1, -1).join(' ') : undefined),
            lastName:
                text(row.lastName) ?? (parts.length > 1 ? parts[parts.length - 1] : undefined),
        };
    }

    /** The party half of an organisation row. */
    function organisation(row: SeedRow): Record<string, unknown> {
        const name = text(row.legalName) ?? text(row.name);
        return {
            name,
            legalName: name,
            tradingName: text(row.tradingName),
            registrationNumber: text(row.registrationNumber) ?? text(row.eik),
            taxId: text(row.taxId),
            establishedDate: text(row.establishedDate),
            industry: text(row.industry),
            website: text(row.website) ?? text(row.site),
            notes: text(row.notes) ?? text(row.note),
        };
    }

    /** The party half of a person row. */
    function person(row: SeedRow): Record<string, unknown> {
        const names = personNames(row);
        if (!names.firstName && !names.lastName) {
            throw new Error('a register row names a person with `name`, or with a first and last name');
        }
        return {
            name: text(row.name),
            personName: text(row.personName) ?? text(row.name),
            internationalName: text(row.internationalName),
            ...names,
            birthDate: text(row.birthDate) ?? text(row.born),
            gender: text(row.gender) ?? text(row.sex),
            nationality: text(row.nationality) ?? 'BUL',
            citizenship: text(row.citizenship) ?? 'Българско',
            photoUrl: text(row.photoUrl),
            notes: text(row.notes) ?? text(row.note),
        };
    }

    /**
     * A key the short form spelled for the handler, not a column: every column of
     * these tables is two-word (`athleteStatus`, `registerIdentifier`), so a key
     * without a capital letter after its first character is an input the mapping
     * above has already spent — `eik`, `register`, `site`, `member`, `duty`.
     */
    const isColumn = (key: string): boolean => /^[a-z][a-z0-9]*[A-Z]/.test(key);

    /** The profile half: everything that is neither the party half nor a reference. */
    function profile(row: SeedRow, party: string[], references: string[]): Record<string, unknown> {
        const out: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(row)) {
            if (!isColumn(key) || party.includes(key) || references.includes(key)) continue;
            out[key] = value;
        }
        return out;
    }

    return {
        async sportRegisterMerge(
            params: {
                federation?: unknown;
                club?: unknown;
                athlete?: unknown;
                coach?: unknown;
            },
            $meta: IMeta,
        ): Promise<{federation: number; club: number; athlete: number; coach: number}> {
            const qb: KnexQb = this.config?.context?.queryBuilder;
            if (!qb) throw new Error('Database not available');

            const merge = (method: string, payload: Record<string, unknown>) =>
                super.exec(payload, {...$meta, method}) as Promise<unknown>;

            const federations = parse(params.federation);
            const clubs = parse(params.club);
            const athletes = parse(params.athlete);
            const coaches = parse(params.coach);

            const sportOf = (row: SeedRow) => text(row.sport);
            const sportNames = [...federations, ...clubs, ...athletes, ...coaches]
                .map(sportOf)
                .filter((name): name is string => !!name);
            const sportIds = await seedReference(qb, 'sport.sport', sportNames);
            const disciplineIds = await seedReference(
                qb,
                'sport.discipline',
                athletes.map(row => text(row.discipline)).filter((name): name is string => !!name),
            );

            // ── Federations and clubs: an organisation, then its profile row ──
            const organisations = [...federations, ...clubs];
            if (organisations.length) {
                await merge('party.organization.merge', {
                    resourceType: 'party.organization',
                    key: 'organizationId',
                    organization: organisations.map(organisation),
                });
            }
            const organisationIds = await seedReference(
                qb,
                'party.organization',
                organisations.map(row => String(row.name)),
            );
            const federationId = (row: SeedRow): Buffer | undefined => {
                const name = text(row.federation) ?? text(row.fed);
                return name ? seedRef(organisationIds, 'party.organization', name) : undefined;
            };

            if (federations.length) {
                await merge('sport.federation.merge', {
                    key: 'federationId',
                    federation: federations.map(row => ({
                        ...profile(row, ORGANISATION_COLUMNS, ['sport']),
                        federationId: seedRef(
                            organisationIds,
                            'party.organization',
                            String(row.name),
                        ),
                        sportId: seedRef(sportIds, 'sport.sport', sportOf(row)!),
                        federationShortName: text(row.federationShortName) ?? text(row.short),
                        federationStatus:
                            text(row.federationStatus) ?? text(row.status) ?? 'active',
                        registerIdentifier: text(row.registerIdentifier) ?? text(row.register),
                        registerSource:
                            text(row.registerSource) ?? 'Регистър на спортните федерации, ММС',
                        federationNote: text(row.federationNote) ?? text(row.licence),
                    })),
                });
            }

            if (clubs.length) {
                await merge('sport.club.merge', {
                    key: 'clubId',
                    club: clubs.map(row => {
                        const member = text(row.member);
                        return {
                            ...profile(row, ORGANISATION_COLUMNS, ['sport', 'member']),
                            clubId: seedRef(
                                organisationIds,
                                'party.organization',
                                String(row.name),
                            ),
                            sportId: seedRef(sportIds, 'sport.sport', sportOf(row)!),
                            clubShortName: text(row.clubShortName) ?? text(row.short),
                            clubStatus: text(row.clubStatus) ?? text(row.status) ?? 'active',
                            registerIdentifier: text(row.registerIdentifier) ?? text(row.register),
                            clubNote:
                                text(row.clubNote) ?? (member ? `Член на ${member}` : undefined),
                        };
                    }),
                });
            }

            // ── Athletes and coaches: a person, then a profile row under that id ─
            const people = [...athletes, ...coaches];
            if (people.length) {
                await merge('party.person.merge', {
                    resourceType: 'party.person',
                    key: 'personId',
                    person: people.map(person),
                });
            }
            const personIds = await seedReference(
                qb,
                'party.person',
                people.map(row => String(row.name)),
            );
            const withFederation = (row: SeedRow) => {
                const id = federationId(row);
                return id ? {currentFederationId: id} : {};
            };
            const withSport = (row: SeedRow) => {
                const sport = sportOf(row);
                return sport ? {primarySportId: seedRef(sportIds, 'sport.sport', sport)} : {};
            };

            if (athletes.length) {
                await merge('sport.athlete.merge', {
                    key: 'athleteId',
                    athlete: athletes.map(row => ({
                        ...profile(row, PERSON_COLUMNS, [
                            'sport',
                            'discipline',
                            'federation',
                            'fed',
                        ]),
                        athleteId: seedRef(personIds, 'party.person', String(row.name)),
                        athleteStatus: text(row.athleteStatus) ?? text(row.status) ?? 'active',
                        careerStartDate: text(row.careerStartDate) ?? text(row.from),
                        careerEndDate: text(row.careerEndDate) ?? text(row.to),
                        athleteNote: text(row.athleteNote),
                        ...withSport(row),
                        ...(text(row.discipline)
                            ? {
                                  primaryDisciplineId: seedRef(
                                      disciplineIds,
                                      'sport.discipline',
                                      String(row.discipline),
                                  ),
                              }
                            : {}),
                        ...withFederation(row),
                    })),
                });
            }

            if (coaches.length) {
                await merge('sport.coach.merge', {
                    key: 'coachId',
                    coach: coaches.map(row => ({
                        ...profile(row, PERSON_COLUMNS, ['sport', 'federation', 'fed']),
                        coachId: seedRef(personIds, 'party.person', String(row.name)),
                        coachStatus: text(row.coachStatus) ?? text(row.status) ?? 'active',
                        careerStartDate: text(row.careerStartDate) ?? text(row.from),
                        certificationNumber: text(row.certificationNumber) ?? text(row.register),
                        certificationStatus:
                            text(row.certificationStatus) ?? (row.register ? 'active' : undefined),
                        certificationValidUntil: text(row.certificationValidUntil),
                        coachNote: text(row.coachNote) ?? text(row.duty),
                        ...withSport(row),
                        ...withFederation(row),
                    })),
                });
            }

            return {
                federation: federations.length,
                club: clubs.length,
                athlete: athletes.length,
                coach: coaches.length,
            };
        },
    };
});
