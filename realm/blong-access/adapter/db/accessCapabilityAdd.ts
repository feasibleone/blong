import {type IMeta, handler} from '@feasibleone/blong';

import * as model from './accessModel.ts';
import * as account from './account.ts';

type KnexQb = any;

/**
 * `access.capability.add` — create a capability (resource + `access_capability`
 * row) plus its assigned actions.
 *
 * Reuses `core.resource.ensure` (the generic knex `add` cannot create the
 * resource row for a `uidNotNull` PK) and writes the `hasAction` edges with their
 * rebuild in `model.syncEdges`. Ticked CRUD columns on the `action` pivot row
 * ensure the `accessCapability<predicate>` action resources and include them;
 * `granted` `otherAction` rows are included as-is.
 */
export default handler(() => ({
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
        // `core.resource.ensure` comes from `core`, a library realm this process carries
        // itself, so `super` reaches it by prototype-chain delegation — same process, same
        // connection (core is an early child of every suite that has it).
        const {resourceId} = (await super.coreResourceEnsure(
            {
                name,
                typeAlias: 'access.capability',
                table: 'access_capability',
                extraColumns: {description: capability.description ?? null},
                keyName: 'capabilityId',
            },
            $meta,
        )) as {resourceId: string};
        const capabilityIdHex = model.binHex(resourceId);
        if (!capabilityIdHex) throw new Error('Could not resolve capability resource id');
        const crudIds = await model.crudPivotActionIds(
            qb,
            // The helper has no `super` of its own, so the binding is closed over here.
            (p: any, m: IMeta) => super.coreResourceEnsure(p, m),
            params.action ?? [],
            $meta,
        );
        const otherIds = (params.otherAction ?? [])
            .filter(r => r.granted)
            .map(r => model.binHex(r.actionId))
            .filter((x): x is string => !!x);
        const all = [...crudIds, ...otherIds];
        if (all.length) {
            await model.syncEdges(qb, capabilityIdHex, 'hasAction', all);
        }
        return {
            capability: {
                capabilityId: model.bufToBase64(account.uuidBuf(resourceId)),
                capabilityName: name,
                description: capability.description ?? null,
            },
        };
    },
}));
