import {type IMeta, handler} from '@feasibleone/blong';

import * as account from './account.ts';
import {type PasswordParams} from './password.ts';

type KnexQb = any;

/**
 * Low-level account creation for the access realm.
 *
 * Creates a `core_resource` (resourceName = email) + `access_user` row, one
 * credential (PBKDF2 `password` or `google` subject id), the `hasRole` Guest
 * edges, and refreshes the materialized `core_path`.  Enforces email
 * uniqueness.  Returns the new `userId` (hex UUID string).
 */
export default handler(
    ({
        errors,
        handler: {'db/coreResourceEnsure': coreResourceEnsure},
        lib: {hashPassword, credentialPolicyParams},
    }) =>
        async function accessAccountAdd(
            params: {
                /** Resource name — the normalized email used as the login key. */
                name: string;
                /** Display email stored on `access_user` (defaults to `name`). */
                emailAddress?: string;
                /** Creates a PBKDF2 password credential when present. */
                password?: string;
                /** Creates a `google` credential storing the provider subject id. */
                googleSubjectId?: string;
                isActive?: boolean;
                /** Comma-separated role names to grant (e.g. `Guest`). */
                roles?: string;
            },
            $meta: IMeta,
        ): Promise<{userId: string}> {
            const qb: KnexQb = this.config?.context?.queryBuilder;
            if (!qb) throw new Error('Database not available');

            const email = params.emailAddress ?? params.name;

            // Uniqueness: no existing access.user resource with this resourceName
            const existing = await qb
                .select('core_resource.resourceId')
                .from('core_resource')
                .join('core_type', 'core_resource.typeId', 'core_type.typeId')
                .where('core_type.typeAlias', 'access.user')
                .where('core_resource.resourceName', params.name)
                .first();
            if (existing) {
                throw errors.errorAccountExists({params: {emailAddress: email}});
            }

            const {resourceId: userId} = await coreResourceEnsure<{resourceId: string}>(
                {
                    name: params.name,
                    typeAlias: 'access.user',
                    table: 'access_user',
                    extraColumns: {emailAddress: email, isActive: params.isActive ?? 1},
                    keyName: 'userId',
                },
                $meta,
            );

            // Credential — password (PBKDF2) or Google subject id
            if (params.password) {
                const salt = account.newUuid();
                // Credential params come from the active policy; config.password is the fallback.
                const policyParams = await credentialPolicyParams(qb, 'password');
                const {hash, params: credentialParams} = hashPassword<{hash: string; params: PasswordParams}>(
                    params.password,
                    salt,
                    policyParams,
                );
                await qb('access_credential')
                    .insert({
                        userId: account.uuidBuf(userId),
                        credentialType: 'password',
                        credentialHash: hash,
                        credentialSalt: salt,
                        // `*JSON` column — the knex adapter stores this object as JSON.
                        credentialParamsJSON: credentialParams,
                        isActive: 1,
                    })
                    .onConflict()
                    .ignore();
            } else if (params.googleSubjectId) {
                await qb('access_credential')
                    .insert({
                        userId: account.uuidBuf(userId),
                        credentialType: 'google',
                        credentialHash: params.googleSubjectId,
                        credentialSalt: '',
                        isActive: 1,
                    })
                    .onConflict()
                    .ignore();
            }

            // Role edges (e.g. Guest)
            if (params.roles) {
                const roleNames = account.splitNames(params.roles);
                for (const roleName of roleNames) {
                    const {resourceId: roleId} = await coreResourceEnsure<{resourceId: string}>(
                        {
                            name: roleName,
                            typeAlias: 'access.role',
                            table: 'access_role',
                            extraColumns: {roleBit: 0, description: `${roleName} role`},
                            keyName: 'roleId',
                        },
                        $meta,
                    );
                    await qb('core_triple')
                        .insert({
                            subjectId: account.uuidBuf(userId),
                            predicateName: 'hasRole',
                            objectId: account.uuidBuf(roleId),
                        })
                        .onConflict()
                        .ignore();
                }
            }

            await qb.raw('CALL access_pathRefresh()');

            return {userId};
        },
);
