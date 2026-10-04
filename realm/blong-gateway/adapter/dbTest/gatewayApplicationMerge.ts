import {type IMeta, handler} from '@feasibleone/blong';

import {uuidBuf} from '../db/gatewayUuid.ts';

// The knex query builder is intentionally untyped here (matches the realm's db handlers).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type KnexQb = any;

/**
 * dbTest seed — register OAuth applications with a KNOWN client secret.
 *
 * `gateway.application.register` is the production path, and it generates the
 * secret (`newUuid()`), which is right for a developer app and wrong for a
 * fixture: a test cannot present a secret it never saw.  This merge takes the
 * secret as input instead, so a fixture can pin one, and it is idempotent — the
 * resource is found or created by clientId and `access.credential.add` rotates
 * the subject's active `clientSecret` to the given value.
 *
 * Wire: `gateway.application.merge` — dispatched from a realm's
 * `meta/dbTest/*.yaml` (the basename's last `-` segment names the handler).
 *
 * Lives in `adapter/dbTest/` because it is TEST-ONLY: the db adapter imports
 * `.dbTest` handler groups only under `dev`, never in production.
 */
export default handler(() => ({
    async gatewayApplicationMerge(
        params: {
            application?: Array<{
                /** ClientId — also the application resource's name. */
                clientId: string;
                /** The client secret to pin (required: a fixture must know it). */
                secret: string;
                /** Owner resource id (hex UUID); NULL for a machine-only app. */
                ownerUserId?: string;
                applicationType?: string;
                description?: string;
                isActive?: boolean;
            }>;
        },
        $meta: IMeta,
    ): Promise<{success: boolean; application: Array<{clientId: string; applicationId: string}>}> {
        const qb: KnexQb = this.config?.context?.queryBuilder;
        if (!qb) throw new Error('Database not available');

        const merged: Array<{clientId: string; applicationId: string}> = [];

        for (const row of params.application ?? []) {
            if (!row.secret) {
                throw new Error(`Application seed has no secret for client "${row.clientId}"`);
            }
            const isActive = row.isActive ?? true;

            // The application resource + its `gateway_application` row.  Find-or-create
            // by clientId, exactly as the production register does.
            const {resourceId: applicationId} = (await super.coreResourceEnsure(
                {
                    name: row.clientId,
                    typeAlias: 'gateway.application',
                    table: 'gateway_application',
                    extraColumns: {
                        ownerUserId: row.ownerUserId ? uuidBuf(row.ownerUserId) : null,
                        applicationType: row.applicationType ?? 'oauth2_client',
                        description: row.description ?? 'Seeded application',
                        isActive: isActive ? 1 : 0,
                    },
                    keyName: 'applicationId',
                },
                $meta,
            )) as {resourceId: string};

            // The pinned client secret.  `access.credential.add` comes from `access`, a
            // library realm this process carries itself, so `super` reaches it in the
            // same process; it deactivates the subject's previous `clientSecret`, so
            // re-running the seed leaves exactly one active secret — the pinned one.
            await super.accessCredentialAdd(
                {
                    subjectResourceId: applicationId,
                    credentialType: 'clientSecret',
                    secret: row.secret,
                    isActive,
                },
                $meta,
            );

            merged.push({clientId: row.clientId, applicationId});
        }

        return {success: true, application: merged};
    },
}));
