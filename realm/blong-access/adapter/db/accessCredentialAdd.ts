import {type IMeta, handler} from '@feasibleone/blong';

import * as account from './account.ts';
import {type PasswordParams} from './password.ts';

type KnexQb = any;

/**
 * Create a credential for a subject resource (user OR application).
 *
 * Wire: `access.credential.add` — reusable credential creation shared by the
 * access and gateway realms.  Uses the same PBKDF2 library + active policy as
 * password credentials, so client secrets benefit from the same hashing
 * parameters and verification path (`access.credential.checkClient`).
 */
export default handler(
    ({lib: {hashPassword, credentialPolicyParams}}) =>
        async function accessCredentialAdd(
            params: {
                /** The subject resource id (hex UUID) the credential belongs to. */
                subjectResourceId: string;
                credentialType: 'password' | 'clientSecret' | 'google';
                /** Secret to hash (required for password/clientSecret). */
                secret?: string;
                /** Provider subject id (for google type). */
                googleSubjectId?: string;
                isActive?: boolean;
            },
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            $meta: IMeta,
        ): Promise<{success: boolean}> {
            const qb: KnexQb = this.config?.context?.queryBuilder;
            if (!qb) throw new Error('Database not available');

            const secret =
                params.credentialType === 'google'
                    ? (params.googleSubjectId ?? '')
                    : (params.secret ?? '');
            const salt = account.newUuid();
            const policyParams = await credentialPolicyParams(qb, params.credentialType);
            const {hash, params: credentialParams} = hashPassword<{
                hash: string;
                params: PasswordParams;
            }>(secret, salt, policyParams);

            // Rotate: deactivate any previously active credential of the same
            // subject + type so the new one becomes the single active credential.
            // This makes credential creation idempotent — re-registering a
            // client (or resetting a password) replaces the old secret instead
            // of stacking a second active row (which would break `.first()`
            // verification that reads the oldest active credential).
            await qb('access_credential')
                .where('userId', account.uuidBuf(params.subjectResourceId))
                .where('credentialType', params.credentialType)
                .update({isActive: 0});

            await qb('access_credential')
                .insert({
                    userId: account.uuidBuf(params.subjectResourceId),
                    credentialType: params.credentialType,
                    credentialHash: hash,
                    credentialSalt: salt,
                    // `*JSON` column — the knex adapter stores this object as JSON.
                    credentialParamsJSON: credentialParams,
                    isActive: params.isActive ?? 1,
                })
                .onConflict()
                .ignore();

            return {success: true};
        },
);
