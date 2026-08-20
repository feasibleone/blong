import {handler} from '@feasibleone/blong';

import * as account from './account.ts';

/**
 * Verify an OAuth client_credentials grant for an application.
 *
 * Wire: `access.credential.checkClient` (client_credentials grant, used by the
 * blong-login `login.token.create` extension).
 *
 * 1. Resolve the application by `clientId` (the `core_resource.resourceName`
 *    of a `gateway.application` resource).
 * 2. Find its active `clientSecret` credential and verify the secret with the
 *    same PBKDF2 library used for password credentials.
 * 3. Resolve the application's effective role bits + actions from the
 *    materialized `core_path`.  Subscribed bundles are linked with
 *    `application hasRole bundle` + `access_pathRefresh`, so the SAME
 *    `access.permission.list` helper used for users returns the app's bundle
 *    roleBits — making authorization uniform in the jwt plugin.
 */
export default handler(
    ({errors, lib: {crockfordEncode, verifyPassword}, handler: {accessPermissionList}}) =>
        async function accessCredentialCheckClient(
            params: {clientId: string; clientSecret: string},
            $meta: Record<string, unknown>,
        ): Promise<{
            applicationId: string;
            isActive: boolean;
            /** Base64 of the raw binary(16) application key — for session creation. */
            applicationKey: string;
            /** Active credential id — for session creation. */
            credentialId: number;
            permissionMap: string;
            actions: string[];
        }> {
            const queryBuilder = this.config?.context?.queryBuilder;
            if (!queryBuilder) throw new Error('Database not available');

            // 1. Find the application by clientId (resourceName) and type alias.
            const app = await queryBuilder
                .select('r.resourceId', 'a.applicationId', 'a.isActive')
                .from('core_resource as r')
                .join('gateway_application as a', 'a.applicationId', 'r.resourceId')
                .join('core_type as t', 't.typeId', 'r.typeId')
                .where('r.resourceName', params.clientId)
                .where('t.typeAlias', 'gateway.application')
                .first();

            if (!app) throw errors.applicationNotFound();
            if (!app.isActive) throw errors.applicationInactive();

            // 2. Find the active clientSecret credential for this application.
            const credential = await queryBuilder
                .select('credentialId', 'credentialHash', 'credentialSalt', 'credentialParamsJSON')
                .from('access_credential')
                .where('userId', app.applicationId)
                .where('credentialType', 'clientSecret')
                .where('isActive', 1)
                .where(function () {
                    this.whereNull('expiresAt').orWhere('expiresAt', '>', new Date());
                })
                .first();

            if (!credential) throw errors.credentialNotFound();

            // 3. Verify the client secret using the stored credential parameters.
            if (
                !verifyPassword(
                    params.clientSecret,
                    credential.credentialHash,
                    credential.credentialSalt,
                    credential.credentialParamsJSON,
                )
            ) {
                throw errors.credentialsMismatch();
            }

            // 4. Resolve effective role bits + action names from the materialized
            //    core_path (the app's subscribed bundle roles).
            const {permissionMap, actions: actionNames} = await accessPermissionList<{
                roleBits: number[];
                actions: string[];
                permissionMap: string;
            }>({userId: account.bufToUuid(app.applicationId)}, $meta);

            return {
                applicationId: crockfordEncode(app.applicationId),
                isActive: app.isActive,
                applicationKey: Buffer.from(app.applicationId).toString('base64'),
                credentialId: credential.credentialId,
                permissionMap,
                actions: actionNames,
            };
        },
);
