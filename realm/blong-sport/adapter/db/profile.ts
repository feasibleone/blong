/* eslint-disable @typescript-eslint/no-explicit-any -- the knex builder and the
   flat profile payload are intentionally untyped here, as in the other realms'
   db handlers; the spec map above is what gives the columns their names. */
import {library} from '@feasibleone/blong';

/**
 * adapter/db/profile.ts — the read/write half of a shared-PK profile table.
 *
 * `sport.athlete` (and its four siblings) uses the party PK as its own, so the
 * generic CRUD cannot serve it: the person half lives in `party_person`, the
 * PK is not a resource PK, and nothing is generated for us. @@D-595 @@D-596
 *
 * The payload is **flat** — `athlete.firstName`, `athlete.lastName`,
 * `athlete.athleteStatus` — because the model form binds one master object and a
 * nested non-detail object has no persistence. @@D-596
 *
 * Ids travel as base64 (`binary(16)` on the wire, 24 characters), so every value
 * that reaches a binary column goes through `asBinary`.
 */

type KnexQb = any;
type Meta = Record<string, unknown>;

/** What makes one profile object from the party half plus its own row. */
export interface IProfileSpec {
    /** Object name — the root key of the payload and the table suffix. */
    object: string;
    table: string;
    key: string;
    /** `party_person` / `party_organization`. */
    partyTable: string;
    partyKey: string;
    /** Columns the profile does not own: read from and written to the party. */
    partyColumns: string[];
    /** Party object name — the payload key of the party add/edit call. */
    partyObject: string;
    /** Columns the profile owns (everything except the key). */
    columns: string[];
}

const PERSON_COLUMNS = [
    'personName',
    'firstName',
    'middleName',
    'lastName',
    'internationalName',
    'birthDate',
    'gender',
    'nationality',
    'citizenship',
    'photoUrl',
];

const ORGANISATION_COLUMNS = [
    'legalName',
    'tradingName',
    'registrationNumber',
    'taxId',
    'establishedDate',
    'industry',
    'website',
];

const SPECS: Record<string, IProfileSpec> = {
    athlete: {
        object: 'athlete',
        table: 'sport_athlete',
        key: 'athleteId',
        partyTable: 'party_person',
        partyKey: 'personId',
        partyColumns: PERSON_COLUMNS,
        partyObject: 'person',
        columns: [
            'athleteStatus',
            'careerStartDate',
            'careerEndDate',
            'primarySportId',
            'primaryDisciplineId',
            'currentFederationId',
            'currentClubId',
            'athleteNote',
        ],
    },
    coach: {
        object: 'coach',
        table: 'sport_coach',
        key: 'coachId',
        partyTable: 'party_person',
        partyKey: 'personId',
        partyColumns: PERSON_COLUMNS,
        partyObject: 'person',
        columns: [
            'coachStatus',
            'careerStartDate',
            'certificationNumber',
            'certificationStatus',
            'certificationValidUntil',
            'primarySportId',
            'currentFederationId',
            'coachNote',
        ],
    },
    specialist: {
        object: 'specialist',
        table: 'sport_specialist',
        key: 'specialistId',
        partyTable: 'party_person',
        partyKey: 'personId',
        partyColumns: PERSON_COLUMNS,
        partyObject: 'person',
        columns: [
            'specialistStatus',
            'expertAreaId',
            'specialtyName',
            'qualificationLevel',
            'certificationNumber',
            'certificationStatus',
            'certificationValidUntil',
            'careerStartDate',
            'specialistNote',
        ],
    },
    federation: {
        object: 'federation',
        table: 'sport_federation',
        key: 'federationId',
        partyTable: 'party_organization',
        partyKey: 'organizationId',
        partyColumns: ORGANISATION_COLUMNS,
        partyObject: 'organization',
        columns: [
            'federationShortName',
            'sportId',
            'federationStatus',
            'registerIdentifier',
            'registerSource',
            'federationNote',
        ],
    },
    club: {
        object: 'club',
        table: 'sport_club',
        key: 'clubId',
        partyTable: 'party_organization',
        partyKey: 'organizationId',
        partyColumns: ORGANISATION_COLUMNS,
        partyObject: 'organization',
        columns: ['clubShortName', 'sportId', 'clubStatus', 'registerIdentifier', 'clubNote'],
    },
};

/** `binary(16)` arrives as 24 base64 characters; everything else passes through. */
const BINARY_16 = /^[A-Za-z0-9+/]{22}==$/;

function asBinary(value: unknown): unknown {
    return typeof value === 'string' && BINARY_16.test(value)
        ? Buffer.from(value, 'base64')
        : value;
}

/** The spec for a profile object; throws when the object is not a profile. */
function profileSpec(object: string): IProfileSpec {
    const spec = SPECS[object];
    if (!spec) throw new Error(`not a profile object: ${object}`);
    return spec;
}

/**
 * `binary(16)` columns must leave as base64 — the generic CRUD does this in
 * `prepareResultRows`, and a raw Buffer would reach the client as
 * `{type: 'Buffer', data: [...]}` and match nothing.
 */
function wireRow(row: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row)) {
        out[key] = Buffer.isBuffer(value) ? value.toString('base64') : value;
    }
    return out;
}

/** A join of the profile row and its party row, with the key kept unambiguous. */
function profileQuery(qb: KnexQb, spec: IProfileSpec) {
    const select = [
        `${spec.table}.*`,
        ...spec.partyColumns.map(column => `${spec.partyTable}.${column}`),
    ];
    return qb(`${spec.table}`)
        .join(spec.partyTable, `${spec.table}.${spec.key}`, `${spec.partyTable}.${spec.partyKey}`)
        .select(select);
}

/**
 * `find` — the flat projection, filtered and paged like the generic list.
 *
 * The browse widget sends `orderBy` as an array of `{field, dir}`; a plain
 * `order` string is accepted too, because both shapes reach the server.
 */
async function profileFind(
    qb: KnexQb,
    object: string,
    params: Record<string, unknown> = {},
): Promise<Record<string, unknown>[]> {
    const spec = profileSpec(object);
    const {
        select: _select,
        paging,
        orderBy,
        order = orderBy,
        limit = (paging as {pageSize?: number} | undefined)?.pageSize,
        offset,
        filterBy,
        search,
        ...where
    } = params as Record<string, any>;

    let query = profileQuery(qb, spec);

    for (const [column, value] of Object.entries({...filterBy, ...where})) {
        if (value === undefined || value === null) continue;
        query = query.where(`${spec.table}.${column}`, asBinary(value) as never);
    }

    if (search) {
        const columns = [...spec.partyColumns, ...spec.columns].filter(column =>
            /Name$|^firstName$|^lastName$/.test(column),
        );
        query = query.andWhere(function (this: KnexQb) {
            for (const column of columns) this.orWhereILike(column, `%${search}%`);
        });
    }

    if (Array.isArray(order)) {
        query = query.orderBy(
            order.map((entry: {field: string; dir?: string}) => ({
                column: entry.field,
                order: entry.dir ?? 'asc',
            })),
        );
    } else if (order) {
        query = query.orderBy(order);
    }

    const pageOffset =
        offset ?? (paging ? ((paging.pageNumber ?? 1) - 1) * (limit ?? 0) : undefined);
    if (limit) query = query.limit(limit);
    if (pageOffset) query = query.offset(pageOffset);

    const rows = (await query) as Array<Record<string, unknown>>;
    return rows.map(wireRow);
}

/**
 * `get` — one flat row by its profile key, wrapped the way the editor expects.
 *
 * The generic `get` answers `{[object]: row}` with each detail array as a
 * sibling; the editor's `loadAction` reads the object root, so a bare row leaves
 * the form empty and `waitForFormData` times out.
 */
async function profileGet(
    qb: KnexQb,
    object: string,
    params: Record<string, unknown> = {},
): Promise<Record<string, unknown> | undefined> {
    const spec = profileSpec(object);
    const id = params[spec.key];
    const row = await profileQuery(qb, spec)
        .where(`${spec.table}.${spec.key}`, asBinary(id))
        .first();
    if (!row) return undefined;
    const result: Record<string, unknown> = {[spec.object]: wireRow(row)};

    // The model.md groups are read-only lists on the athlete page until each is
    // a page of its own; the projection is what feeds them.
    if (object === 'athlete') {
        const key = asBinary(id);
        const related = async (table: string, column: string) =>
            ((await qb(table).where(column, key).limit(50)) as Array<Record<string, unknown>>).map(
                wireRow,
            );
        result.participations = await related('sport_participation', 'athleteId');
        result.campaigns = await related('sport_campaign', 'athleteId');
        result.conferrals = await related('sport_conferral', 'recipientResourceId');
        result.attachments = await related('sport_attachment', 'targetResourceId');
    }

    return result;
}

/** Split a flat payload into the party half and the profile half. */
function splitPayload(spec: IProfileSpec, payload: Record<string, unknown>) {
    const party: Record<string, unknown> = {};
    const own: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(payload)) {
        if (key === spec.key || key === 'name') continue;
        if (spec.partyColumns.includes(key)) party[key] = value;
        else if (spec.columns.includes(key)) own[key] = value;
    }
    return {party, own};
}

/** The full name a person is labelled with, derived when the form leaves it out. */
function personNameOf(party: Record<string, unknown>): string | undefined {
    if (typeof party.personName === 'string' && party.personName.trim()) {
        return party.personName.trim();
    }
    const parts = [party.firstName, party.middleName, party.lastName].filter(
        part => typeof part === 'string' && part.trim(),
    );
    return parts.length ? parts.join(' ') : undefined;
}

/**
 * The profile half's own columns carry the FK ids (`primarySportId`, …) as the
 * 24-character base64 the browser sends; the column is `binary(16)`, so a string
 * written as-is is rejected as too long. `asBinary` leaves every other value
 * alone.
 */
function toBinaryRecord(row: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row)) out[key] = asBinary(value);
    return out;
}

/**
 * `add` — create the party row first, then the profile row under the same id.
 *
 * The party call goes through the handler proxy (`partyPersonAdd` /
 * `partyOrganizationAdd`), so the resource row, its label and the party's own
 * validation all happen where they belong.
 */
async function profileCreate(
    qb: KnexQb,
    object: string,
    params: Record<string, unknown>,
    partyAdd: (params: unknown, meta: Meta) => Promise<unknown>,
    $meta: Meta,
): Promise<unknown> {
    const spec = profileSpec(object);
    const {party, own} = splitPayload(spec, (params[spec.object] ?? {}) as Record<string, unknown>);

    if (spec.partyObject === 'person') {
        const personName = personNameOf(party);
        if (!personName) throw new Error('a person needs personName or a first and last name');
        party.personName = personName;
    } else if (!party.legalName) {
        throw new Error('an organisation needs legalName');
    }

    // The literal `uuid` marker is what makes the generic add generate the PK
    // and the `core_resource` row (the registration path in blong-access does
    // the same); a party row sent without it inserts no id at all.
    party[spec.partyKey] = 'uuid';

    const created = (await partyAdd({[spec.partyObject]: party}, $meta)) as Record<string, any>;
    const partyRow = created?.[spec.partyObject] ?? created;
    const id = partyRow?.[spec.partyKey] ?? partyRow?.[spec.key];
    if (!id) throw new Error(`party create returned no ${spec.partyKey}`);

    const record = {...toBinaryRecord(own), [spec.key]: asBinary(id)};
    await qb(spec.table).insert(record);
    return {[spec.object]: {...party, ...own, [spec.key]: id}};
}

/**
 * `edit` — update the party half, then the profile half.
 *
 * The key never moves: it is the person's resource id, and the profile row is
 * the same human in another role.
 */
async function profileUpdate(
    qb: KnexQb,
    object: string,
    params: Record<string, unknown>,
    partyEdit: (params: unknown, meta: Meta) => Promise<unknown>,
    $meta: Meta,
): Promise<unknown> {
    const spec = profileSpec(object);
    const payload = (params[spec.object] ?? {}) as Record<string, unknown>;
    const id = payload[spec.key];
    if (!id) throw new Error(`${spec.key} is required`);

    const {party, own} = splitPayload(spec, payload);
    if (spec.partyObject === 'person') {
        const personName = personNameOf(party);
        if (personName) party.personName = personName;
    }

    if (Object.keys(party).length) {
        await partyEdit({[spec.partyObject]: {...party, [spec.partyKey]: id}}, $meta);
    }

    if (Object.keys(own).length) {
        await qb(spec.table).where(spec.key, asBinary(id)).update(toBinaryRecord(own));
    }

    return {[spec.object]: {...party, ...own, [spec.key]: id}};
}

/**
 * `remove` — delete the profile row, then the party row behind it.
 *
 * The PK is shared: one person may hold two profiles (a coach who is also a
 * specialist), so the party row is only removed once no other profile table
 * still holds the id — otherwise the second role would lose its name.
 */
async function profileRemove(
    qb: KnexQb,
    object: string,
    params: Record<string, unknown>,
    partyRemove: (params: unknown, meta: Meta) => Promise<unknown>,
    $meta: Meta,
): Promise<unknown> {
    const spec = profileSpec(object);
    const payload = (params[spec.object] ?? params) as Record<string, unknown>;
    const id = payload[spec.key] ?? params[spec.key];
    if (!id) throw new Error(`${spec.key} is required`);

    const key = asBinary(id);
    await qb(spec.table).where(spec.key, key).del();

    // Each profile table has its own key column, so the sibling check asks each
    // spec for its own.
    const held = await Promise.all(
        Object.values(SPECS)
            .filter(sibling => sibling.table !== spec.table)
            .map(sibling => qb(sibling.table).where(sibling.key, key).first(sibling.key)),
    );
    if (held.some(Boolean)) return {[spec.object]: {...payload, [spec.key]: id}};

    // `remove` reads the key at the top level of the payload, not nested under
    // the object — a `{person: {personId}}` call is refused as a missing key.
    await partyRemove({[spec.partyKey]: id}, $meta);
    return {[spec.object]: {...payload, [spec.key]: id}};
}

export default library(() => ({
    profileSpec,
    profileFind,
    profileGet,
    profileCreate,
    profileUpdate,
    profileRemove,
}));
