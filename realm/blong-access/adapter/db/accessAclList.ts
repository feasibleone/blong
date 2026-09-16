import {type IMeta, handler} from '@feasibleone/blong';

import * as model from './accessModel.ts';

type KnexQb = any;

/** One row of the effective ACL, explained for the UI / external callers. */
type AclRow = {
    /** Set for an explicit `access_acl` rule; absent for an implicit grant. */
    aclId?: string;
    principalId: string;
    principalName: string;
    /** Absent for a `hasScope` grant, which covers every action the principal holds. */
    actionId?: string;
    actionName?: string;
    targetId: string;
    targetName: string;
    /** `record` — a single record; `scope` — every record linked to it. */
    targetKind: string;
    /** `allow` or `deny` (a deny always wins). */
    effect: string;
    /** `explicit` — an `access_acl` rule; `implicit` — a `hasScope` grant. */
    source: 'explicit' | 'implicit';
};

/** Binary id of a resource given as a base64, hex or dashed UUID string. */
function toBuffer(value: string | undefined): Buffer | undefined {
    const hex = model.binHex(value);
    return hex ? Buffer.from(hex, 'hex') : undefined;
}

/**
 * `access.acl.list` — the effective ACL of a principal, reported as grant rows so
 * an administrator can see *why* something is allowed rather than only the final
 * verdict.
 *
 * Both halves of the ACL are returned: the explicit `access_acl` rules attached
 * to the principal (and, for a user, to the roles and units it inherits — the
 * rows then carry that principal's name) and the implicit `hasScope` grants.
 * Each row reports `source` so the two can be told apart, and a `deny` row is
 * returned alongside the allows it overrides.
 *
 * Params: `principalType` (`user` — the default and the only kind that expands
 * to the inherited principals — `role`, `unit`, `capability`), `principalId`
 * (base64/hex/dashed; defaults to the caller) and an optional `action` filter.
 */
export default handler(({lib: {crockfordDecode}}) => ({
    async accessAclList(
        params: {principalType?: string; principalId?: string; action?: string},
        $meta: IMeta,
    ): Promise<{items: AclRow[]; principalId?: string; principalName?: string}> {
        const qb: KnexQb = this.config?.context?.queryBuilder;
        if (!qb) throw new Error('Database not available');

        const principalType = params.principalType ?? 'user';
        const actorId = ($meta?.auth as {actorId?: string} | undefined)?.actorId;
        const principalId =
            toBuffer(params.principalId) ??
            (actorId ? Buffer.from(crockfordDecode(actorId)) : undefined);
        if (!principalId) throw new Error('Missing principal identity');
        const principalName = await model.resourceNameFor(qb, principalId);

        // The principals whose rules apply: the principal itself plus — for a
        // user — its roles, its units and those units' ancestors.
        const principalIds: Buffer[] = [principalId];
        if (principalType === 'user') {
            const roles = (await qb('core_path')
                .where('originId', principalId)
                .where('pathType', 'access.effectiveRole')
                .select('destinationId')) as Array<{destinationId: Buffer}>;
            const units = (await qb('core_triple')
                .where('subjectId', principalId)
                .where('predicateName', 'belongsTo')
                .select('objectId')) as Array<{objectId: Buffer}>;
            principalIds.push(...roles.map(r => r.destinationId));
            principalIds.push(...units.map(u => u.objectId));
            const unitIds = units.map(u => u.objectId);
            if (unitIds.length) {
                const ancestors = (await qb('core_path')
                    .whereIn('originId', unitIds)
                    .where('pathType', 'access.effectiveScope')
                    .select('destinationId')) as Array<{destinationId: Buffer}>;
                principalIds.push(...ancestors.map(a => a.destinationId));
            }
        }

        const actionId = params.action
            ? (
                  (await qb('access_action as at')
                      .join('core_resource as r', 'r.resourceId', 'at.actionId')
                      .whereRaw("LOWER(REPLACE(r.resourceName, '.', '')) = ?", [
                          params.action.replaceAll('.', '').toLowerCase(),
                      ])
                      .first('at.actionId')) as {actionId: Buffer} | undefined
              )?.actionId
            : undefined;

        const explicitQuery = qb('access_acl as ab')
            .join('core_resource as pr', 'pr.resourceId', 'ab.principalId')
            .join('access_action as at', 'at.actionId', 'ab.actionId')
            .join('core_resource as ar', 'ar.resourceId', 'at.actionId')
            .join('core_resource as tr', 'tr.resourceId', 'ab.targetId')
            .where('ab.isActive', 1)
            .whereIn('ab.principalId', principalIds)
            .select(
                'ab.aclId',
                'ab.principalId',
                'pr.resourceName as principalName',
                'ar.resourceName as actionName',
                'ab.targetId',
                'ab.targetKind',
                'ab.effect',
                'tr.resourceName as targetName',
            );
        if (actionId) explicitQuery.where('ab.actionId', actionId);

        const explicit = (await explicitQuery) as Array<Record<string, unknown>>;
        const implicit = (await qb('core_triple as hs')
            .join('core_resource as pr', 'pr.resourceId', 'hs.subjectId')
            .join('core_resource as tr', 'tr.resourceId', 'hs.objectId')
            .where('hs.predicateName', 'hasScope')
            .whereIn('hs.subjectId', principalIds)
            .select(
                'hs.subjectId as principalId',
                'pr.resourceName as principalName',
                'hs.objectId as targetId',
                'tr.resourceName as targetName',
            )) as Array<Record<string, unknown>>;

        const explicitRows: AclRow[] = explicit.map(row => ({
            aclId: String(row.aclId),
            principalId: model.bufToBase64(row.principalId as Buffer) ?? '',
            principalName: String(row.principalName),
            actionName: String(row.actionName),
            targetId: model.bufToBase64(row.targetId as Buffer) ?? '',
            targetName: String(row.targetName),
            targetKind: String(row.targetKind),
            effect: String(row.effect),
            source: 'explicit' as const,
        }));
        const implicitRows: AclRow[] = implicit.map(row => ({
            principalId: model.bufToBase64(row.principalId as Buffer) ?? '',
            principalName: String(row.principalName),
            targetId: model.bufToBase64(row.targetId as Buffer) ?? '',
            targetName: String(row.targetName),
            targetKind: 'scope',
            effect: 'allow',
            source: 'implicit' as const,
        }));
        const items = [...explicitRows, ...implicitRows].sort(
            (a, b) =>
                a.targetName.localeCompare(b.targetName) ||
                (a.actionName ?? '').localeCompare(b.actionName ?? ''),
        );

        return {
            items,
            principalId: model.bufToBase64(principalId) ?? undefined,
            principalName: principalName ?? undefined,
        };
    },
}));
