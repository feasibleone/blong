import {type IMeta, handler} from '@feasibleone/blong';

import * as account from './account.ts';
import * as model from './accessModel.ts';

type KnexQb = any;

/**
 * `access.capability.add` — create a capability (resource + `access_capability`
 * row) plus its assigned actions.
 *
 * Reuses `core.resource.ensure` (the generic knex `add` cannot create the
 * resource row for a `uidNotNull` PK) and `core.triple.merge` for the
 * `hasAction` edges. Ticked CRUD columns on the `action` pivot row ensure the
 * `accessCapability<predicate>` action resources and include them; `granted`
 * `otherAction` rows are included as-is.
 */
export default handler(
    ({handler: {'db/coreResourceEnsure': coreResourceEnsure, 'db/coreTripleMerge': coreTripleMerge}}) =>
        ({
            async accessCapabilityAdd(
                params: {
                    capability?: {capabilityName?: string; description?: string};
                    action?: Array<{
                        entityName?: string;
                        find?: boolean;
                        get?: boolean;
                        add?: boolean;
                        edit?: boolean;
                        remove?: boolean;
                    }>;
                    otherAction?: Array<{actionId?: string; granted?: boolean}>;
                },
                $meta: IMeta,
            ): Promise<Record<string, unknown>> {
                const qb: KnexQb = this.config?.context?.queryBuilder;
                if (!qb) throw new Error('Database not available');
                const capability = params.capability ?? {};
                const name = capability.capabilityName || `capability-${Date.now()}`;
                const {resourceId} = await coreResourceEnsure<{resourceId: string}>(
                    {
                        name,
                        typeAlias: 'access.capability',
                        table: 'access_capability',
                        extraColumns: {description: capability.description ?? null},
                        keyName: 'capabilityId',
                    },
                    $meta,
                );
                const capabilityIdHex = model.binHex(resourceId);
                if (!capabilityIdHex) throw new Error('Could not resolve capability resource id');
                const crudIds = await model.crudPivotActionIds(
                    qb,
                    coreResourceEnsure,
                    params.action ?? [],
                    $meta,
                );
                const otherIds = (params.otherAction ?? [])
                    .filter(r => r.granted)
                    .map(r => model.binHex(r.actionId))
                    .filter((x): x is string => !!x);
                const all = [...crudIds, ...otherIds];
                if (all.length) {
                    await model.syncEdges(
                        qb,
                        coreTripleMerge,
                        capabilityIdHex,
                        'hasAction',
                        all,
                        $meta,
                    );
                }
                return {
                    capability: {
                        capabilityId: model.bufToBase64(account.uuidBuf(resourceId)),
                        capabilityName: name,
                        description: capability.description ?? null,
                    },
                };
            },
        }),
);
