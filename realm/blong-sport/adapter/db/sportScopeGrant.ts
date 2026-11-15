import {type IMeta, handler} from '@feasibleone/blong';

// The knex query builder is intentionally untyped here, as in the other db handlers of this realm.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type KnexQb = any;

/** A resource id as the binary column stores it, from the forms an id travels in. */
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
        // Not crockford — a base64 id from a seed or an internal call is the remaining form.
    }
    const base64 = Buffer.from(value, 'base64');
    return base64.length === 16 ? base64 : undefined;
}

/**
 * `sport.scope.grant` — the club and federation scopes the caller holds, as `<kind>:<id>` tokens.
 *
 * The profiles already name both: `sport.athlete` carries `currentClubId` and `currentFederationId`,
 * `sport.coach` a federation, and each id is the `party.organization` the club or federation extends
 * (@@D-595). So the answer is a read of the two profile rows the person's id already owns — a person
 * with no profile holds nothing, which is what keeps an ordinary account out of a club's assets.
 *
 * A token is opaque to the realm that stores a blob: it only compares strings, and the ids are base64
 * — the form the API answers — so a record's scope list and this answer are the same vocabulary
 * (@@D-836).
 *
 * The person comes from `$meta.auth`: the account's `hasProfile` edge says whose tokens these are. A
 * system call (a seed, a test, an internal dispatch) has no account, so it may name the person in
 * `params.personId`; the gateway authenticates every external caller, so the parameter is not a way
 * for one person to ask about another.
 */
export default handler(({lib: {crockfordDecode}}) => ({
    async sportScopeGrant(params: {personId?: string}, $meta: IMeta): Promise<{scopes: string[]}> {
        const qb: KnexQb = this.config?.context?.queryBuilder;
        if (!qb) throw new Error('Database not available');

        const actorId = ($meta?.auth as {actorId?: string} | undefined)?.actorId;
        const person = actorId
            ? await personOf(qb, crockfordDecode, actorId)
            : params?.personId
              ? actorBinary(crockfordDecode, params.personId)
              : undefined;
        // The row is checked too, because an edge can outlive the person it names and a system call can
        // name an id nobody holds.
        if (!person || !(await qb('party_person').select('personId').where('personId', person).first())) {
            return {scopes: []};
        }

        const scopes = new Set<string>([`party:person:${person.toString('base64')}`]);
        const add = (kind: string, id: Buffer | null | undefined) => {
            if (!id) return;
            scopes.add(`sport:${kind}:${Buffer.from(id).toString('base64')}`);
        };

        const athlete = (await qb('sport_athlete')
            .select('currentClubId', 'currentFederationId')
            .where('athleteId', person)
            .first()) as
            | {currentClubId?: Buffer | null; currentFederationId?: Buffer | null}
            | undefined;
        add('club', athlete?.currentClubId);
        add('federation', athlete?.currentFederationId);

        const coach = (await qb('sport_coach')
            .select('currentFederationId')
            .where('coachId', person)
            .first()) as {currentFederationId?: Buffer | null} | undefined;
        add('federation', coach?.currentFederationId);

        return {scopes: [...scopes].sort()};
    },
}));

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
