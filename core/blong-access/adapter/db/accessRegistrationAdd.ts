import {type IMeta, handler} from '@feasibleone/blong';

import * as account from './account.ts';

type KnexQb = any;

const _emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const _minPasswordLength = 8;

/**
 * Self-registration flow handler.
 *
 * Creates a self-service account from an email (+ password or Google subject),
 * grants the `Guest` role, creates a linked `party.person` record via the
 * cross-realm `party.person.add` API, and records the
 * `user --hasProfile--> person` edge in `core.triple`.
 *
 * Used by both the email/password registration form and (via
 * `access.identity.check`) Google auto-registration.
 */
export default handler(
    ({errors, handler: {accessAccountAdd, partyPersonAdd}}) =>
        async function accessRegistrationAdd(
            params: {
                emailAddress: string;
                /** Password credential — required for the registration form. */
                password?: string;
                /** Google subject id — used for Google auto-registration. */
                googleSubjectId?: string;
                firstName: string;
                middleName?: string;
                lastName: string;
                birthDate?: string;
                gender?: string;
                nationality?: string;
                occupation?: string;
            },
            $meta: IMeta,
        ): Promise<{userId: string; personId: string; emailAddress: string}> {
            const email = params.emailAddress.trim().toLowerCase();
            if (!_emailPattern.test(email)) {
                throw errors.errorAccountInvalidEmail();
            }
            if (params.password && params.password.length < _minPasswordLength) {
                throw errors.errorAccountWeakPassword({
                    params: {minLength: _minPasswordLength},
                });
            }
            if (!params.password && !params.googleSubjectId) {
                throw errors.errorAccountInvalidEmail();
            }

            // 1. Create the access account (user + credential + Guest role + refresh)
            const {userId} = await accessAccountAdd<{userId: string}>(
                {
                    name: email,
                    emailAddress: email,
                    password: params.password,
                    googleSubjectId: params.googleSubjectId,
                    roles: 'Guest',
                },
                $meta,
            );

            // 2. Create the person profile via the blong-party realm
            const created = await partyPersonAdd<{person: {personId: string}}>(
                {
                    person: {
                        personId: 'uuid',
                        firstName: params.firstName,
                        middleName: params.middleName,
                        lastName: params.lastName,
                        birthDate: params.birthDate,
                        gender: params.gender,
                        nationality: params.nationality,
                        occupation: params.occupation,
                    },
                },
                $meta,
            );
            const personId = created.person.personId;
            const personIdHex = Buffer.from(personId, 'base64').toString('hex');

            // 3. Link user → hasProfile → person in the resource graph
            const qb: KnexQb = this.config?.context?.queryBuilder;
            if (!qb) throw new Error('Database not available');
            await qb('core_triple')
                .insert({
                    subjectId: account.uuidBuf(userId),
                    predicateName: 'hasProfile',
                    objectId: account.uuidBuf(personIdHex),
                })
                .onConflict()
                .ignore();

            return {userId, personId: personIdHex, emailAddress: email};
        },
);
