import {type IMeta, handler} from '@feasibleone/blong';

type KnexQb = any;

/**
 * Update the currently authenticated user's own profile. The actor id always
 * comes from `$meta.auth.actorId` (the token's `sub` claim) — a caller can
 * never edit someone else's record.
 *
 * Supported fields (all optional — only provided ones are changed):
 * - `emailAddress` → the `access_user` row
 * - `preferredLanguage` → the `core.property` key `preferredLanguage`
 * - `firstName` / `middleName` / `lastName` / `photoUrl` → the linked `party.person` row
 *   (best-effort: only when the `party_person` table exists — otherwise these
 *   are silently ignored, which is the documented fallback for suites without
 *   the party realm)
 *
 * **A user with no profile yet gets one.** A self-registered account arrives with a person
 * (`access.registration.add` links one), but an account whose profile was never filled in has
 * only a user node with no `hasProfile` edge — and until now the first name such a user typed
 * was dropped on the floor. So when the edge is missing and the edit carries both names, the
 * person is created through the party realm's own API (`party.person.add`, the call registration
 * makes) and linked, which keeps the resource row, its label and the party's validation where
 * they belong (`@@D-874`).
 *
 * **And an existing person keeps both of its names and its label.** A rename recomposes
 * `personName` — the label every list and ACL target reads (`@@D-602`) — and a clear that would
 * leave the person nameless is refused with `profile.nameRequired` rather than reaching the
 * `NOT NULL` columns, which is what an emptied field on the profile page used to do (T-694).
 */
export default handler(({errors, lib: {crockfordDecode}, handler: {partyPersonAdd}}) => ({
    async accessProfileEdit(
        params: {
            firstName?: string | null;
            middleName?: string | null;
            lastName?: string | null;
            /** The photograph: a `blob://` reference or an external URL (`@@D-842`). */
            photoUrl?: string | null;
            emailAddress?: string | null;
            preferredLanguage?: string | null;
        },
        $meta: IMeta,
    ): Promise<{success: boolean}> {
        const qb: KnexQb = this.config?.context?.queryBuilder;
        if (!qb) throw new Error('Database not available');

        const actorId = $meta?.auth?.actorId as string | undefined;
        if (!actorId) throw new Error('Missing actor identity in request metadata');
        // The token carries the actor as crockford base32; the columns want the bytes and the graph
        // wants the hex uuid, so both come from one decode.
        const userIdBuf = Buffer.from(crockfordDecode(actorId));
        const userIdHex = userIdBuf.toString('hex');

        if (params.emailAddress !== undefined) {
            await qb('access_user')
                .where('userId', userIdBuf)
                .update({emailAddress: params.emailAddress});
        }

        if (params.preferredLanguage !== undefined) {
            await qb('core_property')
                .insert({
                    resourceId: userIdBuf,
                    propertyName: 'preferredLanguage',
                    propertyValue: params.preferredLanguage,
                })
                .onConflict(['resourceId', 'propertyName'])
                .merge({propertyValue: params.preferredLanguage});
        }

        const personPatch: Record<string, string | null> = {};
        if (params.firstName !== undefined) personPatch.firstName = params.firstName;
        if (params.middleName !== undefined) personPatch.middleName = params.middleName;
        if (params.lastName !== undefined) personPatch.lastName = params.lastName;
        if (params.photoUrl !== undefined) personPatch.photoUrl = params.photoUrl;
        if (Object.keys(personPatch).length) {
            // Whether the suite has the party schema at all, which is a different answer from "this
            // user has no profile yet": the first is the documented no-personal-data fallback, the
            // second is the case the create below is for.
            let partySchema = true;
            let person: IPersonRow | undefined;
            try {
                person = await qb
                    .select(
                        't.objectId',
                        'p.firstName',
                        'p.middleName',
                        'p.lastName',
                        'p.personName',
                    )
                    .from('core_triple as t')
                    .leftJoin('party_person as p', 'p.personId', 't.objectId')
                    .where('t.subjectId', userIdBuf)
                    .where('t.predicateName', 'hasProfile')
                    .first();
            } catch {
                // party_person table is not present — name fields cannot be stored; this is the
                // documented no-personal-data fallback.
                partySchema = false;
            }

            if (partySchema && person) {
                await updatePerson(qb, person, personPatch, errors.errorProfileNameRequired);
            } else if (partySchema) {
                try {
                    const personId = await createPerson(partyPersonAdd, personPatch, $meta);
                    if (personId) {
                        // One edge, merged the way every other caller in this realm
                        // writes one — the helper refreshes the materialized paths, which
                        // is what makes the new profile visible to the ACL walk.
                        await super.coreTripleMerge(
                            {
                                triples: [
                                    {
                                        subjectId: userIdHex,
                                        predicateName: 'hasProfile',
                                        objectId: personId,
                                    },
                                ],
                                refreshPath: true,
                            },
                            $meta,
                        );
                    }
                } catch {
                    // A party realm this process cannot reach: the profile page works, the
                    // names are not kept — the same silence as a suite without the schema.
                }
            }
        }

        return {success: true};
    },
}));

/**
 * The person this user's profile already points at, with the values it holds.
 *
 * The row rather than the edge alone, because an edit is judged against what it *leaves*: the label
 * below is composed from the merged names, and whether the person still has a name at all is the
 * question the row answers.
 */
interface IPersonRow {
    objectId: Buffer;
    firstName: string | null;
    middleName: string | null;
    lastName: string | null;
    personName: string | null;
}

/**
 * The person a user's profile was missing, created through the party realm and answered as hex.
 *
 * Both names are required, because the row cannot hold a person without them. The id comes back as
 * base64 — the wire form of a `binary(16)` column — and the graph takes hex, which is the same
 * conversion `access.registration.add` makes.
 *
 * A photograph on its own creates nothing: `party_person.firstName` and `lastName` are `NOT NULL`,
 * so there is no row for it to land in and the caller keeps the documented silence.
 */
const createPerson = async (
    partyPersonAdd: (params: object, $meta: IMeta) => unknown,
    patch: Record<string, string | null>,
    $meta: IMeta,
): Promise<string | undefined> => {
    const firstName = filled(patch.firstName);
    const lastName = filled(patch.lastName);
    if (!firstName || !lastName) return undefined;
    const middleName = filled(patch.middleName);
    const created = (await partyPersonAdd(
        {
            person: {
                // The sentinel the generic add reads as "generate the id and the `core_resource`
                // row" — the one registration sends.
                personId: 'uuid',
                personName: [firstName, middleName, lastName].filter(Boolean).join(' '),
                firstName,
                middleName,
                lastName,
                ...(patch.photoUrl !== undefined ? {photoUrl: patch.photoUrl} : {}),
            },
        },
        $meta,
    )) as {person?: {personId?: string}};
    const personId = created?.person?.personId;
    if (!personId) throw new Error('party.person.add answered without a personId');
    return Buffer.from(personId, 'base64').toString('hex');
};

/** A form field as the value worth storing: an empty one is not a name. */
const filled = (value: string | null | undefined): string | undefined =>
    typeof value === 'string' && value.trim() ? value.trim() : undefined;

/** The full name a person's label carries: the three columns, empties dropped (`@@D-602`). */
const fullNameOf = (columns: {
    firstName?: string | null;
    middleName?: string | null;
    lastName?: string | null;
}): string =>
    [columns.firstName, columns.middleName, columns.lastName].filter(Boolean).join(' ').trim();

/**
 * Write the edit to the person's row, keeping the label in step and refusing a nameless person.
 *
 * Two things the row decides rather than the handler. **The label:** `personName` is the full name,
 * which is what every list and ACL target reads (`@@D-602`), so a rename composes it again from the
 * merged row — a label left at the old name is a person listed under a name they no longer have. The
 * resource's own `resourceName` stays as it was: renaming a graph node is a different operation,
 * since lookups by name hang off it, and this handler edits a person rather than the graph.
 *
 * **The name:** `firstName` and `lastName` are `NOT NULL`, and an emptied field arrives as `null`
 * from the profile page, so a clear used to reach the database as a constraint error. The merged row
 * is judged instead, which is the same rule the create path applies (`@@D-874`), and a caller is told
 * what is wrong with a 400 rather than a 500.
 */
const updatePerson = async (
    qb: KnexQb,
    person: IPersonRow,
    patch: Record<string, string | null>,
    errorNameRequired: () => Error,
): Promise<void> => {
    const supplied = (column: keyof IPersonRow): boolean => patch[column] !== undefined;
    const merged = {
        firstName: supplied('firstName') ? patch['firstName'] : person.firstName,
        middleName: supplied('middleName') ? patch['middleName'] : person.middleName,
        lastName: supplied('lastName') ? patch['lastName'] : person.lastName,
    };
    if (!filled(merged.firstName) || !filled(merged.lastName)) throw errorNameRequired();
    if (supplied('firstName') || supplied('middleName') || supplied('lastName')) {
        const label = fullNameOf(merged);
        if (label !== (person.personName ?? '')) patch['personName'] = label;
    }
    await qb('party_person').where('personId', person.objectId).update(patch);
};
