import {type IMeta} from '@feasibleone/blong';

import {handler} from './handlerGroup.ts';

// The knex query builder is intentionally untyped here, as in the access realm's db handlers.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type KnexQb = any;

/** The deepest `isPartOf` walk, so a malformed graph cannot keep the query going. */
const MAX_DEPTH = 8;

/**
 * A resource id as the binary column stores it.
 *
 * The JWT `sub` is crockford-base32 and `crockfordEncode` reverses the bytes, so decoding round-trips
 * to the order `core_triple` holds — the same resolution the framework's own ACL applies to
 * `$meta.auth.actorId`. A dashed UUID, hex or base64 string is accepted too, because a test and an
 * internal call may hand over any of them.
 */
function actorBinary(
    crockfordDecode: (value: string) => Uint8Array,
    value: string,
): Buffer | undefined {
    const dashed = value.replaceAll('-', '');
    if (/^[0-9a-f]{32}$/i.test(dashed)) return Buffer.from(dashed, 'hex');
    try {
        const raw = crockfordDecode(value);
        if (raw.length === 16) return Buffer.from(raw);
    } catch {
        // Not crockford — a base64 id from a test or a seed is the remaining form.
    }
    const base64 = Buffer.from(value, 'base64');
    return base64.length === 16 ? base64 : undefined;
}

/** The person the actor's account is the profile of, from `user --hasProfile--> person`. */
async function personOf(
    qb: KnexQb,
    crockfordDecode: (value: string) => Uint8Array,
    actorId: string,
): Promise<Buffer | undefined> {
    const subjectId = actorBinary(crockfordDecode, actorId);
    if (!subjectId) return undefined;
    const profile = (await qb('core_triple as t')
        .select('t.objectId')
        .where('t.subjectId', subjectId)
        .where('t.predicateName', 'hasProfile')
        .first()) as {objectId: Buffer} | undefined;
    return profile ? Buffer.from(profile.objectId) : undefined;
}

/** The object ids of every `<subject> --<predicate>--> ?` edge. */
async function rows(qb: KnexQb, subjectId: Buffer, predicateName: string): Promise<Buffer[]> {
    const edges = (await qb('core_triple')
        .select('objectId')
        .where('subjectId', subjectId)
        .where('predicateName', predicateName)) as {objectId: Buffer}[];
    return edges.map(edge => Buffer.from(edge.objectId));
}

/** Which of `ids` name a row of `table`, so an edge pointing somewhere else is not mistaken for one. */
async function belonging(qb: KnexQb, table: string, key: string, ids: Buffer[]): Promise<Buffer[]> {
    if (!ids.length) return [];
    const found = (await qb(table).select(key).whereIn(key, ids)) as Record<string, Buffer>[];
    return found.map(row => Buffer.from(row[key]));
}

/**
 * `party.scope.grant` — the party scopes the caller holds, as `<kind>:<id>` tokens.
 *
 * The walk is the graph the realm already keeps (@@D-836): `user --hasProfile--> person`, then
 * `person --belongsTo--> unit`, then `unit --isPartOf--> unit` up the tree and
 * `unit --belongsTo--> organization`. No table is added and no column is denormalised — the answer is
 * a read of `core_triple`, which is where the hierarchy lives. Every step is checked against the
 * table it claims to name, because one predicate carries several shapes (`belongsTo` is both a
 * membership and an ownership) and only a row of `party_unit` continues the walk upwards.
 *
 * A token is opaque to the realm that stores a blob: it only compares strings. Ids are base64 — the
 * form the API answers — so the value a browser writes on a record is the value this method answers.
 *
 * The person comes from `$meta.auth`: the account's `hasProfile` edge says whose tokens these are. A
 * system call (a seed, a test, an internal dispatch) has no account, so it may name the person in
 * `params.personId` instead — the gateway authenticates every external caller, so the parameter is not
 * a way for one person to ask about another.
 */
export default handler(({lib: {crockfordDecode}}) => ({
    async partyScopeGrant(params: {personId?: string}, $meta: IMeta): Promise<{scopes: string[]}> {
        const qb: KnexQb = this.config?.context?.queryBuilder;
        if (!qb) throw new Error('Database not available');

        const actorId = ($meta?.auth as {actorId?: string} | undefined)?.actorId;
        // Where the caller's human half comes from. An authenticated call asks the graph, which is the
        // only path an external caller reaches; a system call (a seed, a test, an internal dispatch)
        // names the person instead, because it has no account to start from.
        const person = actorId
            ? await personOf(qb, crockfordDecode, actorId)
            : params?.personId
              ? actorBinary(crockfordDecode, params.personId)
              : undefined;
        // A user nobody linked to a person holds nothing: the account exists, its human half does not.
        // The row is checked too, because an edge can outlive the person it names.
        if (!person || !(await belonging(qb, 'party_person', 'personId', [person])).length) {
            return {scopes: []};
        }

        const personId = Buffer.from(person);
        const scopes = new Set<string>([`party:person:${personId.toString('base64')}`]);

        // Upwards from the units the person is a member of: each parent is a member too, so a grant on
        // the head office reaches everyone below it.
        const units = new Map<string, Buffer>();
        let frontier = await belonging(
            qb,
            'party_unit',
            'unitId',
            await rows(qb, personId, 'belongsTo'),
        );
        for (let depth = 0; frontier.length && depth < MAX_DEPTH; depth += 1) {
            const next: Buffer[] = [];
            for (const unitId of frontier) {
                const hex = unitId.toString('hex');
                if (units.has(hex)) continue;
                units.set(hex, unitId);
                next.push(
                    ...(await belonging(
                        qb,
                        'party_unit',
                        'unitId',
                        await rows(qb, unitId, 'isPartOf'),
                    )),
                );
            }
            frontier = next;
        }

        for (const unitId of units.values()) {
            scopes.add(`party:unit:${unitId.toString('base64')}`);
            for (const orgId of await belonging(
                qb,
                'party_organization',
                'organizationId',
                await rows(qb, unitId, 'belongsTo'),
            )) {
                scopes.add(`party:org:${orgId.toString('base64')}`);
            }
        }

        return {scopes: [...scopes].sort()};
    },
}));
