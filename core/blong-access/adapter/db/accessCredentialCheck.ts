import {handler} from '@feasibleone/blong';

import * as account from './account.ts';

export default handler(
    ({
        errors,
        lib: {crockfordEncode, verifyPassword},
        handler: {accessPermissionList},
    }) =>
        async function accessCredentialCheck(
            params: {username: string; password: string},
            $meta: Record<string, unknown>,
        ): Promise<{
            userId: string;
            permissionMap: string;
            actions: string[];
        }> {
            const queryBuilder = this.config?.context?.queryBuilder;
            if (!queryBuilder) throw new Error('Database not available');

            // 1. Find the user by username (resourceName) and type alias 'access.user'
            const user = await queryBuilder
                .select('r.resourceId', 'u.userId', 'u.isActive')
                .from('core_resource as r')
                .join('access_user as u', 'u.userId', 'r.resourceId')
                .join('core_type as t', 't.typeId', 'r.typeId')
                .where('r.resourceName', params.username)
                .where('t.typeAlias', 'access.user')
                .first();

            if (!user) {
                throw errors.userNotFound();
            }

            if (!user.isActive) {
                throw errors.userInactive();
            }

            // 2. Find the active password credential for this user
            const credential = await queryBuilder
                .select(
                    'credentialId',
                    'credentialHash',
                    'credentialSalt',
                    'credentialParamsJSON',
                )
                .from('access_credential')
                .where('userId', user.userId)
                .where('credentialType', 'password')
                .where('isActive', 1)
                .where(function () {
                    this.whereNull('expiresAt').orWhere('expiresAt', '>', new Date());
                })
                .first();

            if (!credential) {
                throw errors.credentialNotFound();
            }

            // 3. Verify password using the credential parameters stored on the row
            // (`credentialParamsJSON` is parsed to an object by the knex adapter;
            // fall back to config.password when it was not persisted).
            if (
                !verifyPassword(
                    params.password,
                    credential.credentialHash,
                    credential.credentialSalt,
                    credential.credentialParamsJSON,
                )
            ) {
                throw errors.credentialsMismatch();
            }

            // 4. Resolve effective role bits + action names from the materialized core_path
            const {permissionMap, actions: actionNames} = await accessPermissionList<{
                roleBits: number[];
                actions: string[];
                permissionMap: string;
            }>(
                {userId: account.bufToUuid(user.userId)},
                $meta,
            );

            return {
                userId: crockfordEncode(user.userId),
                permissionMap,
                actions: actionNames,
            };
        },
);
