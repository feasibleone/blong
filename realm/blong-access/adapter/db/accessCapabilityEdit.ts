import {type IMeta} from '@feasibleone/blong';

import {handler} from './handlerGroup.ts';

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
export default handler(({lib: {binHex, crudPivotActionIds, syncEdges}}) => ({
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
        const hex = binHex(capability.capabilityId);
        if (!hex) throw new Error('Invalid capability id');
        if (
            typeof capabilityName === 'string' ||
            Array.isArray(action) ||
            Array.isArray(otherAction)
        ) {
            // The rename, the action resources it points at and the action set are
            // one transaction: a failure between them left a capability named one
            // thing and granting another.  The action resources come from
            // `core.resource.ensure` in `core` — a library realm this process carries
            // itself, reached by `super` in the same process and on the same
            // connection, so it takes this transaction rather than opening its own.
            await qb.transaction(async (trx: KnexQb) => {
                if (typeof capabilityName === 'string') {
                    await trx('core_resource')
                        .where('resourceId', Buffer.from(hex, 'hex'))
                        .update({resourceName: capabilityName});
                }
                if (Array.isArray(action) || Array.isArray(otherAction)) {
                    const crudIds = await crudPivotActionIds(
                        trx,
                        (p: any, m: IMeta) => super.coreResourceEnsure(p, m, trx),
                        action ?? [],
                        $meta,
                    );
                    const otherIds = (otherAction ?? [])
                        .filter(r => r.granted)
                        .map(r => binHex(r.actionId))
                        .filter((x): x is string => !!x);
                    await syncEdges(trx, hex, 'hasAction', [...crudIds, ...otherIds]);
                }
            });
        }
        return result;
    },
}));
