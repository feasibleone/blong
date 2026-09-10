import {type IMeta, handler} from '@feasibleone/blong';

import * as model from './accessModel.ts';

type KnexQb = any;

/**
 * Return the currently authenticated user's own profile: account details
 * (username, email, active flag), the persisted preferred language
 * (`core.property` key `preferredLanguage`), the granted roles (`hasRole`
 * graph edges) and — when available — the linked `party.person` record
 * (resolved through the `user --hasProfile--> person` graph edge).
 *
 * The `party.person` part is best-effort: it is only returned when the
 * `party_person` table exists AND the user has a `hasProfile` edge (the
 * standalone access suite has no party schema, so callers there simply see
 * `person: null` — the profile page then falls back to no personal details).
 */
export default handler(
    ({lib: {crockfordDecode}}) =>
        async function accessProfileGet(
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            _params: Record<string, never>,
            $meta: IMeta,
        ): Promise<{
            userId: string;
            userName: string | null;
            emailAddress: string | null;
            isActive: boolean;
            preferredLanguage: string | null;
            roles: Array<{roleId: string; roleName: string}>;
            person: {
                personId: string;
                firstName: string;
                middleName: string | null;
                lastName: string;
                birthDate: string | null;
                gender: string | null;
                nationality: string | null;
                occupation: string | null;
            } | null;
        }> {
            const qb: KnexQb = this.config?.context?.queryBuilder;
            if (!qb) throw new Error('Database not available');

            const actorId = $meta?.auth?.actorId as string | undefined;
            if (!actorId) throw new Error('Missing actor identity in request metadata');
            const userIdBuf = Buffer.from(crockfordDecode(actorId));

            const user = await qb
                .select('u.emailAddress', 'u.isActive', 'r.resourceName')
                .from('access_user as u')
                .join('core_resource as r', 'r.resourceId', 'u.userId')
                .where('u.userId', userIdBuf)
                .first();

            const pref = await qb('core_property')
                .select('propertyValue')
                .where('resourceId', userIdBuf)
                .where('propertyName', 'preferredLanguage')
                .first();

            const roles = await model.edgeRowsWithNames(
                qb,
                userIdBuf,
                'hasRole',
                'access_role',
                'roleId',
                'roleName',
            );

            // Best-effort: party.person only exists when the party realm is
            // part of the suite. A missing table (or a user without a linked
            // person) simply yields `person: null` — no personal details.
            let person: Awaited<ReturnType<typeof accessProfileGet>>['person'] = null;
            try {
                const row = await qb
                    .select(
                        'p.personId',
                        'p.firstName',
                        'p.middleName',
                        'p.lastName',
                        'p.birthDate',
                        'p.gender',
                        'p.nationality',
                        'p.occupation',
                    )
                    .from('core_triple as t')
                    .join('party_person as p', 'p.personId', 't.objectId')
                    .where('t.subjectId', userIdBuf)
                    .where('t.predicateName', 'hasProfile')
                    .first();
                if (row) {
                    person = {
                        personId: Buffer.from(row.personId).toString('base64'),
                        firstName: row.firstName,
                        middleName: row.middleName ?? null,
                        lastName: row.lastName,
                        birthDate: row.birthDate ?? null,
                        gender: row.gender ?? null,
                        nationality: row.nationality ?? null,
                        occupation: row.occupation ?? null,
                    };
                }
            } catch {
                // party_person table is not present — treat as no personal data.
            }

            return {
                userId: actorId,
                userName: user?.resourceName ?? null,
                emailAddress: user?.emailAddress ?? null,
                isActive: user?.isActive ? Boolean(user.isActive) : false,
                preferredLanguage:
                    (pref?.propertyValue as string | undefined | null) ?? null,
                roles: (roles ?? []).map(r => ({
                    roleId: r.roleId as string,
                    roleName: r.roleName as string,
                })),
                person,
            };
        },
);
