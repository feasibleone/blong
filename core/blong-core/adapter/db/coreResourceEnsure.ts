import {type IMeta, handler} from '@feasibleone/blong';

import {bufToUuid, ensureType, newUuid, uuidBuf} from './core.ts';

type KnexQb = any;

/**
 * Ensure a `core_resource` + entity-table row exist for a named entity.
 *
 * Looks up an existing `core_resource` by `typeAlias` + `resourceName` and
 * returns its `resourceId` (hex UUID string) when present.  Otherwise it
 * creates the `core_type`, the `core_resource`, and the entity-table row
 * (`table`, keyed by `keyName`, with `extraColumns`) and returns the new id.
 * When the resource already exists the entity row is left untouched
 * (preserving e.g. a pre-seeded roleBit).
 *
 * Wire: `core.resource.ensure` — shared resource-graph helper in the
 * `core.db` handler group, imported by the `srv.db` knex adapter.
 */
export default handler(
    () =>
        async function coreResourceEnsure(
            params: {
                name: string;
                typeAlias: string;
                table: string;
                extraColumns: Record<string, unknown>;
                keyName: string;
            },
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            _$meta: IMeta,
        ): Promise<{resourceId: string}> {
            const qb: KnexQb = this.config?.context?.queryBuilder;
            if (!qb) throw new Error('Database not available');

            const existing = await qb
                .select('core_resource.resourceId')
                .from('core_resource')
                .join('core_type', 'core_resource.typeId', 'core_type.typeId')
                .where('core_type.typeAlias', params.typeAlias)
                .where('core_resource.resourceName', params.name)
                .first();
            if (existing) return {resourceId: bufToUuid(existing.resourceId)};

            const typeId = await ensureType(qb, params.typeAlias);
            const resourceId = newUuid();
            await qb('core_resource')
                .insert({resourceId: uuidBuf(resourceId), resourceName: params.name, typeId})
                .onConflict()
                .ignore();
            // `INSERT IGNORE` (not `ON DUPLICATE KEY UPDATE`): the keyName is a
            // fresh UUID so it never conflicts here, while `merge()` would also
            // fire on ANY other unique key — e.g. `access_role.roleBit` — and
            // silently OVERWRITE an existing row (destroying the role). Ignore
            // keeps the insert insert-only, matching the core_resource row above.
            await qb(params.table)
                .insert({[params.keyName]: uuidBuf(resourceId), ...params.extraColumns})
                .onConflict(params.keyName)
                .ignore();
            return {resourceId};
        },
);
