import {type IMeta, handler} from '@feasibleone/blong';

// The knex query builder is intentionally untyped here (matches the access realm's db handlers).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type KnexQb = any;

/**
 * dbTest seed — link an access user to a `party.person` via the
 * `user --hasProfile--> person` graph edge, so the self-service profile page
 * has personal details (name → avatar initials) in the blong-party suite.
 *
 * Wire: `partyTestProfileMerge` — dispatched from
 * `meta/dbTest/partyTestProfileMerge.yaml` (a `.dbTest.asset`).
 * Idempotent: if the user already has a `hasProfile` edge, the seed is a no-op.
 *
 * Lives in `adapter/dbTest/` because it is a TEST-ONLY seed: the db adapter
 * imports `.dbTest` handler groups only under `dev` (never in production),
 * so this handler is never registered for production seeding.
 */
export default handler(
    ({handler: {'db/coreResourceEnsure': coreResourceEnsure}}) =>
        async function partyTestProfileMerge(
            params: {
                userName: string;
                firstName: string;
                middleName?: string;
                lastName: string;
                birthDate?: string;
                gender?: string;
                nationality?: string;
                occupation?: string;
            },
            $meta: IMeta,
        ): Promise<{success: boolean; linked?: boolean}> {
            const qb: KnexQb = this.config?.context?.queryBuilder;
            if (!qb) throw new Error('Database not available');

            // 1. Resolve the access user by resourceName.
            const user = (await qb
                .select('r.resourceId')
                .from('core_resource as r')
                .join('core_type as t', 't.typeId', 'r.typeId')
                .where('r.resourceName', params.userName)
                .where('t.typeAlias', 'access.user')
                .first()) as {resourceId: Buffer} | undefined;
            if (!user) return {success: false, linked: false};

            const userIdBuf = Buffer.from(user.resourceId);

            // 2. Already linked? (idempotent across restarts).
            const existing = (await qb('core_triple')
                .where('subjectId', userIdBuf)
                .where('predicateName', 'hasProfile')
                .first()) as {objectId: Buffer} | undefined;
            if (existing) return {success: true, linked: true};

            // 3. Ensure a party.person resource + row.
            const {resourceId: personId} = await coreResourceEnsure<{resourceId: string}>({
                name: `${params.firstName} ${params.lastName}`.trim(),
                typeAlias: 'party.person',
                table: 'party_person',
                extraColumns: {
                    firstName: params.firstName,
                    middleName: params.middleName ?? null,
                    lastName: params.lastName,
                    birthDate: params.birthDate ?? null,
                    gender: params.gender ?? null,
                    nationality: params.nationality ?? null,
                    occupation: params.occupation ?? null,
                },
                keyName: 'personId',
            }, $meta);

            // 4. Link user → hasProfile → person.
            await qb('core_triple')
                .insert({
                    subjectId: userIdBuf,
                    predicateName: 'hasProfile',
                    objectId: Buffer.from(personId.replace(/-/g, ''), 'hex'),
                })
                .onConflict()
                .ignore();

            return {success: true, linked: true};
        },
);
