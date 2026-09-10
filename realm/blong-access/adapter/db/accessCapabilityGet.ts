import {type IMeta, handler} from '@feasibleone/blong';

import * as model from './accessModel.ts';

type KnexQb = any;

/**
 * `access.capability.get` — a capability plus its assigned actions.
 *
 * The standard row comes from `super.exec`; the display name is joined from
 * `core_resource` and the `hasAction` edges are returned as the `action` pivot
 * rows (standard CRUD booleans) and `otherAction` rows (non-CRUD actions).
 */
export default handler(() => ({
    async accessCapabilityGet(
        params: {capabilityId?: string},
        $meta: IMeta,
    ): Promise<Record<string, unknown>> {
        const qb: KnexQb = this.config?.context?.queryBuilder;
        if (!qb) throw new Error('Database not available');
        const result = (await super.exec(params, $meta)) as Record<string, unknown>;
        const capability = (result.capability ?? {}) as {
            capabilityId?: string;
            capabilityName?: string;
            description?: string;
        };
        const hex = model.binHex(params.capabilityId ?? capability.capabilityId);
        if (hex) {
            result.capability = {
                ...capability,
                capabilityId: model.bufToBase64(capability.capabilityId),
                capabilityName:
                    (await model.resourceNameFor(qb, hex)) ??
                    capability.capabilityName ??
                    null,
            };
            const {action, otherAction} = await model.capabilityActionRows(qb, hex);
            result.action = action;
            result.otherAction = otherAction;
        }
        return result;
    },
}));
