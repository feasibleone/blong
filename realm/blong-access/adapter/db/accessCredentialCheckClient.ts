import {handler} from '@feasibleone/blong';

import * as account from './account.ts';

/**
 * Verify an OAuth client_credentials grant for an application.
 *
 * Wire: `access.credential.checkClient` (client_credentials grant, used by the
 * blong-login `login.token.create` extension).
 *
 * 1. Resolve the subject by `clientId`: an `access_user` profile carrying that
 *    `clientId` first (a service account `access.user.merge` attached to a unit
 *    or an organization), then a `gateway.application` whose resource name is
 *    the clientId — the historic shape, and the one the gateway realm registers.
 * 2. Find the subject's active `clientSecret` credential and verify the secret
 *    with the same PBKDF2 library used for password credentials.
 * 3. Resolve the subject's effective role bits + actions from the materialized
 *    `core_path`.  Subscribed bundles are linked with
 *    `application hasRole bundle` + `access_pathRefresh`, so the SAME
 *    `access.permission.list` helper used for users returns the app's bundle
 *    roleBits — making authorization uniform in the jwt plugin.
 *
 * The returned `applicationId` / `applicationKey` name the *subject*, whatever
 * resolved it — the field names predate service accounts and are kept because
 * `login.token.create` mints the token's `sub` claim from them.
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

            // 1. Resolve the subject.  A user profile carrying this clientId wins —
            //    that is how a service account on a unit or an organization
            //    authenticates — otherwise the clientId is the resource name of a
            //    registered `gateway.application`.
            const profile = (await queryBuilder
                .select('u.userId', 'u.isActive')
                .from('access_user as u')
                .where('u.clientId', params.clientId)
                .first()) as {userId: Buffer; isActive: number} | undefined;

            let subjectId: Buffer;
            let subjectIsActive: number;
            if (profile) {
                if (!profile.isActive) throw errors.userInactive();
                subjectId = profile.userId;
                subjectIsActive = profile.isActive;
            } else {
                const app = (await queryBuilder
                    .select('a.applicationId', 'a.isActive')
                    .from('core_resource as r')
                    .join('gateway_application as a', 'a.applicationId', 'r.resourceId')
                    .join('core_type as t', 't.typeId', 'r.typeId')
                    .where('r.resourceName', params.clientId)
                    .where('t.typeAlias', 'gateway.application')
                    .first()) as {applicationId: Buffer; isActive: number} | undefined;

                if (!app) throw errors.applicationNotFound();
                if (!app.isActive) throw errors.applicationInactive();
                subjectId = app.applicationId;
                subjectIsActive = app.isActive;
            }

            // 2. Find the active clientSecret credential for the subject.
            const credential = await queryBuilder
                .select('credentialId', 'credentialHash', 'credentialSalt', 'credentialParamsJSON')
                .from('access_credential')
                .where('userId', subjectId)
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
            }>({userId: account.bufToUuid(subjectId)}, $meta);

            return {
                applicationId: crockfordEncode(subjectId),
                isActive: Boolean(subjectIsActive),
                applicationKey: Buffer.from(subjectId).toString('base64'),
                credentialId: credential.credentialId,
                permissionMap,
                actions: actionNames,
            };
        },
);
