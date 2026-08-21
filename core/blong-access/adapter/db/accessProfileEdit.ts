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
 * - `firstName` / `middleName` / `lastName` → the linked `party.person` row
 *   (best-effort: only when the user actually has a `hasProfile` edge and the
 *   `party_person` table exists — otherwise these are silently ignored, which
 *   is the documented fallback for suites without the party realm)
 */
export default handler(
    ({lib: {crockfordDecode}}) =>
        async function accessProfileEdit(
            params: {
                firstName?: string | null;
                middleName?: string | null;
                lastName?: string | null;
                emailAddress?: string | null;
                preferredLanguage?: string | null;
            },
            $meta: IMeta,
        ): Promise<{success: boolean}> {
            const qb: KnexQb = this.config?.context?.queryBuilder;
            if (!qb) throw new Error('Database not available');

            const actorId = $meta?.auth?.actorId as string | undefined;
            if (!actorId) throw new Error('Missing actor identity in request metadata');
            const userIdBuf = Buffer.from(crockfordDecode(actorId));

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

            const namePatch: Record<string, string | null> = {};
            if (params.firstName !== undefined) namePatch.firstName = params.firstName;
            if (params.middleName !== undefined) namePatch.middleName = params.middleName;
            if (params.lastName !== undefined) namePatch.lastName = params.lastName;
            if (Object.keys(namePatch).length) {
                try {
                    const person = await qb
                        .select('t.objectId')
                        .from('core_triple as t')
                        .where('t.subjectId', userIdBuf)
                        .where('t.predicateName', 'hasProfile')
                        .first();
                    if (person) {
                        await qb('party_person')
                            .where('personId', person.objectId)
                            .update(namePatch);
                    }
                } catch {
                    // party_person table is not present — name fields cannot be
                    // stored; this is the documented no-personal-data fallback.
                }
            }

            return {success: true};
        },
);
