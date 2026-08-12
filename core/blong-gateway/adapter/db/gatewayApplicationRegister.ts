import {type IMeta, handler} from '@feasibleone/blong';

import {newUuid, uuidBuf} from './gatewayUuid.ts';

type KnexQb = any;

/**
 * Register an OAuth application for a developer.
 *
 * Wire: `gateway.application.register` — creates the application resource
 * (clientId = resourceName) plus its `clientSecret` credential (via
 * `access.credential.add`).  The client secret is returned ONCE; it cannot be
 * retrieved later (only re-issued by rotating the credential).
 *
 * Uses the shared `core.resource.ensure` helper (find-or-create by name) so
 * re-registering the same clientId is idempotent — the existing resource is
 * reused and `access.credential.add` rotates the active secret.
 */
export default handler(
    ({
        errors,
        lib: {crockfordDecode, crockfordEncode},
        handler: {'db/coreResourceEnsure': coreResourceEnsure, accessCredentialAdd},
    }) =>
        async function gatewayApplicationRegister(
            params: {
                /** ClientId / application display name. */
                clientId: string;
                /** Owner (developer) resource id (hex UUID); defaults to the authenticated user. */
                ownerUserId?: string;
                applicationType?: string;
                description?: string;
                isActive?: boolean;
            },
            $meta: IMeta,
        ): Promise<{
            applicationId: string;
            clientId: string;
            clientSecret: string;
        }> {
            const qb: KnexQb = this.config?.context?.queryBuilder;
            if (!qb) throw new Error('Database not available');

            // Resolve the owner from the authenticated developer when not supplied.
            const ownerUserId =
                params.ownerUserId ??
                (() => {
                    const actorId = ($meta?.auth as {actorId?: string} | undefined)?.actorId;
                    if (!actorId) throw errors.applicationNotFound();
                    return Buffer.from(crockfordDecode(actorId) as Uint8Array).toString('hex');
                })();

            const {resourceId: applicationId} = await coreResourceEnsure<{resourceId: string}>(
                {
                    name: params.clientId,
                    typeAlias: 'gateway.application',
                    table: 'gateway_application',
                    extraColumns: {
                        ownerUserId: uuidBuf(ownerUserId),
                        applicationType: params.applicationType ?? 'oauth2_client',
                        description: params.description ?? 'Registered application',
                        isActive: params.isActive ?? 1,
                    },
                    keyName: 'applicationId',
                },
                $meta,
            );

            const clientSecret = newUuid();
            await accessCredentialAdd<{success: boolean}>(
                {
                    subjectResourceId: applicationId,
                    credentialType: 'clientSecret',
                    secret: clientSecret,
                    isActive: params.isActive ?? 1,
                },
                $meta,
            );

            return {
                applicationId: crockfordEncode(uuidBuf(applicationId)),
                clientId: params.clientId,
                clientSecret,
            };
        },
);
