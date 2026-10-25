import {type IMeta, handler} from '@feasibleone/blong';

// The knex query builder is untyped here, as in the rest of the adapter's db group.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type KnexQb = any;

/**
 * `sport.dropdown.list` — the auto-bound per-table lists plus the ones the model
 * system cannot bind itself.
 *
 * The generic list is the map of every resource-backed dropdown
 * (`sport.sport`, `sport.discipline`, `sport.competition`, …), reached with
 * `super.exec`; an override that answers one key would leave the rest empty.
 *
 * The five profile tables share the party PK, so their key is not a
 * `core.resource` FK and the adapter has nothing to bind: their lists are read
 * here, labelled with the party's own name column — `personName` for people (the
 * full name, which is also the resource label — @@D-602) and `legalName` for
 * organisations. `sport.recipient` merges the five with the kind in the label, so
 * one picker serves a recipient that may be any of them.
 *
 * The two time-bound tables (`edition`, `participation`) carry a `ulid` key and
 * are not resource-backed either.
 */
const PROFILES: Record<string, {table: string; key: string; label: string; party: string}> = {
    'sport.athlete': {
        table: 'sport_athlete',
        key: 'athleteId',
        label: 'personName',
        party: 'party_person',
    },
    'sport.coach': {
        table: 'sport_coach',
        key: 'coachId',
        label: 'personName',
        party: 'party_person',
    },
    'sport.specialist': {
        table: 'sport_specialist',
        key: 'specialistId',
        label: 'personName',
        party: 'party_person',
    },
    'sport.federation': {
        table: 'sport_federation',
        key: 'federationId',
        label: 'legalName',
        party: 'party_organization',
    },
    'sport.club': {
        table: 'sport_club',
        key: 'clubId',
        label: 'legalName',
        party: 'party_organization',
    },
};

/** The kind a `sport.recipient` value belongs to, in payload vocabulary. */
const KIND_OF: Record<string, string> = {
    'sport.athlete': 'athlete',
    'sport.coach': 'coach',
    'sport.specialist': 'specialist',
    'sport.federation': 'federation',
    'sport.club': 'club',
};

/** Time-bound rows, whose key is a `ulid` and whose label is a plain column. */
const PLAIN: Record<string, {table: string; key: string; label: string; order: string}> = {
    'sport.edition': {
        table: 'sport_edition',
        key: 'editionId',
        label: 'editionName',
        order: 'editionYear',
    },
};

interface IOption {
    value: string;
    label: string;
}

/**
 * A `binary(16)` key leaves knex as a `Buffer`, which JSON-serialises to
 * `{type: 'Buffer', data: [...]}` and reaches the server as text that is too long
 * for the column. The base map is prepared by the adapter for the same reason;
 * these lists are built here, so they convert too.
 */
function wireOption(row: {value: unknown; label: unknown}): IOption {
    const value = Buffer.isBuffer(row.value) ? row.value.toString('base64') : row.value;
    return {value: String(value), label: String(row.label ?? '')};
}

function profileList(
    qb: KnexQb,
    source: {table: string; key: string; label: string; party: string},
): Promise<IOption[]> {
    const partyKey = source.party === 'party_person' ? 'personId' : 'organizationId';
    return qb(source.table)
        .join(source.party, `${source.table}.${source.key}`, `${source.party}.${partyKey}`)
        .select(
            `${source.table}.${source.key} as value`,
            `${source.party}.${source.label} as label`,
        )
        .orderBy(`${source.party}.${source.label}`)
        .then((rows: Array<{value: unknown; label: unknown}>) => rows.map(wireOption));
}

export default handler(() => ({
    async sportDropdownList(
        params: Record<string, unknown>,
        $meta: IMeta,
    ): Promise<Record<string, unknown>> {
        const qb: KnexQb = this.config?.context?.queryBuilder;
        const base = (await super.exec({}, $meta)) as Record<string, unknown>;
        if (!qb) return base;

        const lists: Record<string, unknown> = {};
        for (const [name, source] of Object.entries(PROFILES)) {
            lists[name] = await profileList(qb, source);
        }
        for (const [name, plain] of Object.entries(PLAIN)) {
            const rows = (await qb(plain.table)
                .select(`${plain.key} as value`, `${plain.label} as label`)
                .orderBy(plain.order)) as Array<{value: unknown; label: unknown}>;
            lists[name] = rows.map(wireOption);
        }

        const recipients: IOption[] = [];
        for (const [name, source] of Object.entries(PROFILES)) {
            const kind = KIND_OF[name];
            for (const option of await profileList(qb, source)) {
                recipients.push({value: option.value, label: `${option.label} (${kind})`});
            }
        }
        lists['sport.recipient'] = recipients.sort((a, b) => a.label.localeCompare(b.label));

        // A participation is identified by its athlete and edition: the result
        // page files a result against one of them, and the pair is what tells two
        // entries of the same competition apart.
        lists['sport.participation'] = (
            (await qb('sport_participation as p')
                .leftJoin('sport_edition as e', 'e.editionId', 'p.editionId')
                .leftJoin('party_person as pp', 'pp.personId', 'p.athleteId')
                .select(
                    'p.participationId as value',
                    qb.raw(
                        "concat(coalesce(e.editionName, ''), ' · ', coalesce(pp.personName, p.participationFormat)) as label",
                    ),
                )
                .orderBy('label')) as Array<{value: unknown; label: unknown}>
        ).map(wireOption);

        // Organisations are read here rather than through `party.dropdown.list`:
        // a cross-realm dropdown needs a grant the sport capability does not own,
        // and the answer is the same table with the label this realm expects.
        lists['sport.organization'] = (
            (await qb('party_organization')
                .select('organizationId as value', 'legalName as label')
                .orderBy('legalName')) as Array<{value: unknown; label: unknown}>
        ).map(wireOption);

        return {...base, ...lists};
    },
}));
