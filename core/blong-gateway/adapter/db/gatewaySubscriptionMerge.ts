import {type IMeta, handler} from '@feasibleone/blong';

import {newUuid, uuidBuf} from './gatewayUuid.ts';

type KnexQb = any;

/**
 * Create/merge subscriptions linking an application to a bundle.
 *
 * Wire: `gateway.subscription.merge` — besides the `gateway_subscription` row,
 * creates the `application hasRole bundleRole` core.triple edge and refreshes
 * `access_pathRefresh`, so the application's effective actions (and hence its
 * token authorization) follow from the subscribed bundle.  The graph edge +
 * refresh go through the shared `core.triple.merge` helper (P3).
 */
export default handler(
    ({
        handler: {
            'db/coreResourceEnsure': coreResourceEnsure,
            'db/coreTripleMerge': coreTripleMerge,
        },
    }) =>
        async function gatewaySubscriptionMerge(
            params: {
                subscription?: Record<
                    string,
                    {
                        /** Application clientId. */
                        application?: string;
                        /** Bundle name. */
                        bundle?: string;
                        status?: string;
                        startsAt?: string;
                        endsAt?: string;
                    }
                >;
            },
            $meta: IMeta,
        ): Promise<{success: boolean}> {
            const qb: KnexQb = this.config?.context?.queryBuilder;
            if (!qb) throw new Error('Database not available');

            if (!params.subscription) return {success: true};

            const triples: Array<{subjectId: string; predicateName: string; objectId: string}> = [];

            for (const [, subDef] of Object.entries(params.subscription)) {
                // Resolve the application resource (by clientId).
                const {resourceId: applicationId} = await coreResourceEnsure<{resourceId: string}>(
                    {
                        name: subDef.application ?? '',
                        typeAlias: 'gateway.application',
                        table: 'gateway_application',
                        extraColumns: {
                            ownerUserId: null,
                            applicationType: 'oauth2_client',
                            description: 'Demo API consumer',
                            isActive: 1,
                        },
                        keyName: 'applicationId',
                    },
                    $meta,
                );

                // The bundle's role IS the bundle resource (bundleId === roleId).
                const {resourceId: roleId} = await coreResourceEnsure<{resourceId: string}>(
                    {
                        name: subDef.bundle ?? '',
                        typeAlias: 'access.role',
                        table: 'access_role',
                        extraColumns: {roleBit: 0, description: `${subDef.bundle} bundle role`},
                        keyName: 'roleId',
                    },
                    $meta,
                );

                // Subscription row — upsert on (applicationId, bundleId) so the
                // seed is idempotent across server restarts.
                await qb('gateway_subscription')
                    .insert({
                        subscriptionId: uuidBuf(newUuid()),
                        applicationId: uuidBuf(applicationId),
                        bundleId: uuidBuf(roleId),
                        status: subDef.status ?? 'active',
                        startsAt: new Date(subDef.startsAt ?? '2000-01-01'),
                        endsAt: subDef.endsAt ? new Date(subDef.endsAt) : null,
                        createdAt: new Date(),
                    })
                    .onConflict(['applicationId', 'bundleId'])
                    .merge();

                // Authorization edge: application hasRole bundle role
                triples.push({
                    subjectId: applicationId,
                    predicateName: 'hasRole',
                    objectId: roleId,
                });
            }

            await coreTripleMerge({triples, refreshPath: true}, $meta);

            return {success: true};
        },
);
