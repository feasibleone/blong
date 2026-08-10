import {type IMeta, handler} from '@feasibleone/blong';

type KnexQb = any;

/**
 * Return the currently authenticated user's own profile — their email address
 * and the linked `party.person` record (resolved through the
 * `user --hasProfile--> person` graph edge).
 */
export default handler(
    ({lib: {crockfordDecode}}) =>
        async function accessProfileGet(
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            _params: Record<string, never>,
            $meta: IMeta,
        ): Promise<{
            userId: string;
            emailAddress: string | null;
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
                .select('emailAddress')
                .from('access_user')
                .where('userId', userIdBuf)
                .first();

            const person = await qb
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

            return {
                userId: actorId,
                emailAddress: user?.emailAddress ?? null,
                person: person ?? null,
            };
        },
);
