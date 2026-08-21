import {type IMeta, handler} from '@feasibleone/blong';

import * as account from './account.ts';
import {type PasswordParams} from './password.ts';

type KnexQb = any;

/**
 * `access.profile.password.change` — change the caller's own password.
 *
 * Self-service: the actor id comes from `$meta.auth.actorId` (the token's
 * `sub` claim). Verifies the supplied `currentPassword` against the active
 * password credential, enforces the active `access.policy` (min length), then
 * rotates the credential (deactivates the old active row + inserts the new
 * hash). The current session is intentionally kept alive — changing the
 * password does not sign the user out.
 */
export default handler(
    ({
        errors,
        lib: {crockfordDecode, verifyPassword, hashPassword, credentialPolicyParams},
    }) =>
        async function accessProfilePasswordChange(
            params: {currentPassword: string; newPassword: string},
            $meta: IMeta,
        ): Promise<{success: boolean}> {
            const qb: KnexQb = this.config?.context?.queryBuilder;
            if (!qb) throw new Error('Database not available');

            const actorId = $meta?.auth?.actorId as string | undefined;
            if (!actorId) throw new Error('Missing actor identity in request metadata');
            const userIdBuf = Buffer.from(crockfordDecode(actorId));

            // 1. Active password credential for this user.
            const credential = await qb('access_credential')
                .select('credentialHash', 'credentialSalt', 'credentialParamsJSON')
                .where('userId', userIdBuf)
                .where('credentialType', 'password')
                .where('isActive', 1)
                .first();
            if (!credential) throw errors.errorCredentialNotFound();

            // 2. Verify the current password against the stored credential.
            if (
                !verifyPassword(
                    params.currentPassword,
                    credential.credentialHash,
                    credential.credentialSalt,
                    credential.credentialParamsJSON,
                )
            ) {
                throw errors.errorProfileWrongPassword();
            }

            // 3. Enforce the active password policy (min length from the seed).
            const policy = await qb('access_policy')
                .select('minLength')
                .where('credentialType', 'password')
                .where('isActive', 1)
                .first();
            const minLength = Number(policy?.minLength) || 8;
            if (params.newPassword.length < minLength) {
                throw errors.errorAccountWeakPassword({params: {minLength}});
            }

            // 4. Rotate: deactivate the old active row, insert the new hash.
            const salt = account.newUuid();
            const policyParams = await credentialPolicyParams(qb, 'password');
            const {hash, params: credentialParams} = hashPassword<{
                hash: string;
                params: PasswordParams;
            }>(params.newPassword, salt, policyParams);

            await qb('access_credential')
                .where('userId', userIdBuf)
                .where('credentialType', 'password')
                .update({isActive: 0});

            await qb('access_credential').insert({
                userId: userIdBuf,
                credentialType: 'password',
                credentialHash: hash,
                credentialSalt: salt,
                // `*JSON` column — the knex adapter stores this object as JSON.
                credentialParamsJSON: credentialParams,
                isActive: 1,
            });

            return {success: true};
        },
);
