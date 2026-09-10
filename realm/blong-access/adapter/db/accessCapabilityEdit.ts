import {type IMeta, handler} from '@feasibleone/blong';

import * as model from './accessModel.ts';

type KnexQb = any;

/**
 * `access.capability.edit` — update a capability's columns, display name and
 * assigned actions.
 *
 * The standard `access_capability` update runs through `super.exec` (the
 * virtual `capabilityName` field is stripped — it is not a table column). The
 * resource name is updated when `capabilityName` is provided, and the
 * `hasAction` edges are brought in line with the submitted `action` /
 * `otherAction` arrays (when present). Ticked CRUD columns on the `action`
 * pivot row ensure the `accessCapability<predicate>` action resources.
 */
export default handler(
    ({handler: {'db/coreResourceEnsure': coreResourceEnsure, 'db/coreTripleMerge': coreTripleMerge}}) => ({
        async accessCapabilityEdit(
            params: {
                capability?: {capabilityId?: string; capabilityName?: string; description?: string};
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
        ): Promise<unknown> {
            const qb: KnexQb = this.config?.context?.queryBuilder;
            if (!qb) throw new Error('Database not available');
            const {capability = {}, action, otherAction} = params;
            const {capabilityName, ...capabilityColumns} = capability;
            const result = await super.exec({...params, capability: capabilityColumns}, $meta);
            const hex = model.binHex(capability.capabilityId);
            if (!hex) throw new Error('Invalid capability id');
            if (typeof capabilityName === 'string') {
                await qb('core_resource')
                    .where('resourceId', Buffer.from(hex, 'hex'))
                    .update({resourceName: capabilityName});
            }
            if (Array.isArray(action) || Array.isArray(otherAction)) {
                const crudIds = await model.crudPivotActionIds(
                    qb,
                    coreResourceEnsure,
                    action ?? [],
                    $meta,
                );
                const otherIds = (otherAction ?? [])
                    .filter(r => r.granted)
                    .map(r => model.binHex(r.actionId))
                    .filter((x): x is string => !!x);
                await model.syncEdges(
                    qb,
                    coreTripleMerge,
                    hex,
                    'hasAction',
                    [...crudIds, ...otherIds],
                    $meta,
                );
            }
            return result;
        },
    }),
);
