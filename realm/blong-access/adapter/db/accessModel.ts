/**
 * Shared persistence helpers for the access UI models (`access.db` group).
 *
 * Plain module (like `account.ts`) imported directly by the `access.db`
 * handlers. Handlers keep the `handler:`-proxy access to
 * `db/coreTripleMerge` / `db/coreResourceEnsure` and pass the merge function
 * into `syncEdges`; every other helper only needs the knex query builder.
 */
import {type IMeta} from '@feasibleone/blong';

import * as account from './account.ts';

type KnexQb = any;

type TripleMerge = (
    params: {
        triples: Array<{subjectId: string; predicateName: string; objectId: string}>;
        refreshPath?: boolean;
    },
    $meta: IMeta,
) => Promise<{success: boolean}> | {success: boolean};

/** The standard CRUD predicates a capability can grant in the action pivot grid. */
export const STANDARD_CRUD_PREDICATES = ['find', 'get', 'add', 'edit', 'remove'] as const;

/**
 * Normalise a `binary(16)` value (Buffer or base64 string) to a hex string.
 * Returns `undefined` for empty values. The wire representation of binary
 * columns is base64 (see the knex adapter `prepareResultRow`).
 */
export function binHex(value: Buffer | string | undefined): string | undefined {
    if (value === undefined || value === null) return undefined;
    if (Buffer.isBuffer(value)) return value.toString('hex');
    if (typeof value === 'string') {
        if (!value) return undefined;
        // Base64-encoded `binary(16)` (the wire format) — decode to hex.
        const buf = Buffer.from(value, 'base64');
        if (buf.length === 16) return buf.toString('hex');
        // Dashed hex UUID (e.g. `core.resource.ensure`) — strip dashes.
        return value.replace(/-/g, '');
    }
    return undefined;
}

/** Convert a `binary(16)` value to its base64 wire representation. */
export function bufToBase64(value: Buffer | string | undefined): string | undefined {
    if (value === undefined || value === null) return undefined;
    return Buffer.isBuffer(value) ? value.toString('base64') : value;
}

/** Fetch the `core_resource.resourceName` for a resource-backed entity row. */
export async function resourceNameFor(
    qb: KnexQb,
    resourceId: Buffer | string,
): Promise<string | null> {
    const hex = binHex(resourceId);
    if (!hex) return null;
    const row = (await qb('core_resource')
        .where('resourceId', Buffer.from(hex, 'hex'))
        .first('resourceName')) as {resourceName: string} | undefined;
    return row?.resourceName ?? null;
}

/**
 * Enrich rows with the resource name for their resource-backed key, e.g.
 * `{roleId, roleBit, description}` → `{..., roleName}`.
 */
export async function joinResourceNames<T extends Record<string, unknown>>(
    qb: KnexQb,
    rows: T[],
    idField: string,
    nameField: string,
): Promise<T[]> {
    const ids = rows
        .map(r => binHex(r[idField] as Buffer | string))
        .filter((x): x is string => !!x);
    if (!ids.length) return rows;
    const found = (await qb('core_resource')
        .whereIn(
            'resourceId',
            ids.map(hex => Buffer.from(hex, 'hex')),
        )
        .select('resourceId', 'resourceName')) as Array<{resourceId: Buffer; resourceName: string}>;
    const names = new Map<string, string>();
    for (const r of found) names.set(r.resourceId.toString('hex'), r.resourceName);
    return rows.map(row => {
        const hex = binHex(row[idField] as Buffer | string);
        const name = hex ? names.get(hex) : undefined;
        return name !== undefined ? ({...row, [nameField]: name} as T) : row;
    });
}

/**
 * Object ids (hex) of the graph edges `subjectId -predicate-> objectId`
 * (`core_triple`). Returns `[]` when the subject has no such edges.
 */
export async function listEdgeObjectIds(
    qb: KnexQb,
    subjectId: Buffer | string,
    predicateName: string,
): Promise<string[]> {
    const hex = binHex(subjectId);
    if (!hex) return [];
    const rows = (await qb('core_triple')
        .where('subjectId', Buffer.from(hex, 'hex'))
        .where('predicateName', predicateName)
        .select('objectId')) as Array<{objectId: Buffer}>;
    return rows.map(r => r.objectId.toString('hex'));
}

/**
 * Rows of the objects reachable from `subjectId` via `predicateName`, joined
 * with their resource name and serialized as base64 ids (matching the wire
 * format the model pivot tables expect).
 */
export async function edgeRowsWithNames<T extends Record<string, unknown>>(
    qb: KnexQb,
    subjectId: Buffer | string,
    predicateName: string,
    table: string,
    idField: string,
    nameField: string,
): Promise<T[]> {
    const ids = await listEdgeObjectIds(qb, subjectId, predicateName);
    if (!ids.length) return [];
    const rows = (await qb(table).whereIn(
        idField,
        ids.map(hex => Buffer.from(hex, 'hex')),
    )) as T[];
    const named = await joinResourceNames(qb, rows, idField, nameField);
    return named.map(row => ({...row, [idField]: bufToBase64(row[idField] as Buffer)}) as T);
}

/**
 * Split a standard-CRUD action name into its entity + predicate.
 *
 * Every action whose name ends with a capitalised standard CRUD predicate
 * (`accessUserFind`, `accessRoleEdit`, …) collapses to one entity row in the
 * capability action pivot (`accessUser`, `accessRole`, …). Returns `undefined`
 * for actions with a non-CRUD predicate (e.g. `accessSessionClose`) and for
 * anything not matching the `access` + `Entity` + capitalised predicate shape.
 */
export function crudActionParts(
    actionName: string,
): {entity: string; predicate: string} | undefined {
    for (const p of STANDARD_CRUD_PREDICATES) {
        const suffix = p[0].toUpperCase() + p.slice(1);
        if (actionName.length > suffix.length && actionName.endsWith(suffix)) {
            return {entity: actionName.slice(0, -suffix.length), predicate: p};
        }
    }
    return undefined;
}

/** `accessUser` + `find` → `accessUserFind`. */
export function crudActionName(entityName: string, predicate: string): string {
    return `${entityName}${predicate[0].toUpperCase()}${predicate.slice(1)}`;
}

/**
 * The action-assignment rows of a capability (from its `hasAction` edges):
 * - `action` — every standard-CRUD action collapses to ONE pivot row per
 *   entity (`accessUser`, `accessRole`, …) with boolean columns for the
 *   standard CRUD predicates, derived from the granted `access` + `Entity` +
 *   capitalised predicate actions. Used by the CRUD pivot grid on the
 *   capability Open form.
 * - `otherAction` — every remaining action (non-CRUD predicates and anything
 *   not of the `access` + `Entity` + capitalised predicate shape), each with a
 *   `granted` boolean, shown in the "Other Actions" card inside the Action tab.
 */
export async function capabilityActionRows(
    qb: KnexQb,
    capabilityId: Buffer | string,
): Promise<{action: Array<Record<string, unknown>>; otherAction: Array<Record<string, unknown>>}> {
    const ids = await listEdgeObjectIds(qb, capabilityId, 'hasAction');
    const byEntity = new Map<string, Set<string>>();
    const otherAction: Array<Record<string, unknown>> = [];
    if (ids.length) {
        const rows = (await qb('access_action').whereIn(
            'actionId',
            ids.map(hex => Buffer.from(hex, 'hex')),
        )) as Array<{actionId: Buffer; description?: string; [k: string]: unknown}>;
        const named = await joinResourceNames(qb, rows, 'actionId', 'actionName');
        for (const row of named) {
            const actionName = (row.actionName as string) ?? '';
            const parts = crudActionParts(actionName);
            if (parts) {
                let predicates = byEntity.get(parts.entity);
                if (!predicates) {
                    predicates = new Set();
                    byEntity.set(parts.entity, predicates);
                }
                predicates.add(parts.predicate);
            } else {
                otherAction.push({
                    actionId: bufToBase64(row.actionId),
                    actionName,
                    granted: true,
                });
            }
        }
    }
    const action: Array<Record<string, unknown>> = [];
    for (const [entity, predicates] of byEntity) {
        const row: Record<string, unknown> = {entityName: entity};
        for (const p of STANDARD_CRUD_PREDICATES) row[p] = predicates.has(p);
        action.push(row);
    }
    action.sort((a, b) => String(a.entityName).localeCompare(String(b.entityName)));
    return {action, otherAction};
}

/**
 * Map submitted CRUD pivot rows to their `access` + `Entity` + capitalised
 * predicate action object ids. Each ticked column ensures its action resource
 * exists (the CRUD actions are not pre-seeded) and returns its hex id.
 * Non-ticked columns and rows without an `entityName` are skipped.
 */
export async function crudPivotActionIds(
    qb: KnexQb,
    coreResourceEnsure: (
        params: Record<string, unknown>,
        $meta: IMeta,
    ) => Promise<{resourceId: Buffer | string}> | {resourceId: Buffer | string},
    rows: Array<Record<string, unknown>>,
    $meta: IMeta,
): Promise<string[]> {
    const ids: string[] = [];
    for (const row of rows) {
        if (typeof row.entityName !== 'string' || !row.entityName) continue;
        for (const p of STANDARD_CRUD_PREDICATES) {
            if (row[p] === true) {
                const actionName = crudActionName(row.entityName, p);
                const {resourceId} = await coreResourceEnsure(
                    {
                        name: actionName,
                        typeAlias: 'access.action',
                        table: 'access_action',
                        extraColumns: {description: `${actionName} action`},
                        keyName: 'actionId',
                    },
                    $meta,
                );
                const hex = binHex(resourceId);
                if (!hex) throw new Error(`Could not resolve action resource id for ${actionName}`);
                ids.push(hex);
            }
        }
    }
    return ids;
}

/**
 * Bring `subjectId -predicate-> objectId` edges in line with `objectHexIds`.
 *
 * Missing edges are added through the shared `core.triple.merge` helper with
 * the path refresh deferred; stale edges are deleted directly; a single
 * `access_pathRefresh()` rebuild runs afterwards inside one transaction.
 */
export async function syncEdges(
    qb: KnexQb,
    merge: TripleMerge,
    subjectId: Buffer | string,
    predicateName: string,
    objectHexIds: string[],
    $meta: IMeta,
): Promise<void> {
    const subjectHex = binHex(subjectId);
    if (!subjectHex) return;
    const existing = await listEdgeObjectIds(qb, subjectHex, predicateName);
    const existingSet = new Set(existing);
    const target = new Set(objectHexIds);
    const toAdd = objectHexIds.filter(id => !existingSet.has(id));
    const toRemove = existing.filter(id => !target.has(id));
    if (toAdd.length) {
        await merge(
            {
                triples: toAdd.map(objectId => ({
                    subjectId: subjectHex,
                    predicateName,
                    objectId,
                })),
                refreshPath: false,
            },
            $meta,
        );
    }
    if (toAdd.length || toRemove.length) {
        await qb.transaction(async (trx: KnexQb) => {
            if (toRemove.length) {
                await trx('core_triple')
                    .where('subjectId', Buffer.from(subjectHex, 'hex'))
                    .where('predicateName', predicateName)
                    .whereIn(
                        'objectId',
                        toRemove.map(id => Buffer.from(id, 'hex')),
                    )
                    .del();
            }
            await trx.raw('CALL access_pathRefresh()');
        });
    }
}

/**
 * Credential rows of a user (safe columns only — never the hash/salt/params),
 * serialized like the knex adapter: binary `userId` as base64, `credentialId`
 * as-is.
 */
export async function listCredentials(
    qb: KnexQb,
    userId: Buffer | string,
): Promise<Array<Record<string, unknown>>> {
    const hex = binHex(userId);
    if (!hex) return [];
    const rows = (await qb('access_credential')
        .where('userId', Buffer.from(hex, 'hex'))
        .orderBy('credentialId', 'asc')
        .select('credentialId', 'userId', 'credentialType', 'isActive', 'expiresAt')) as Array<
        Record<string, unknown>
    >;
    return rows.map(row => ({...row, userId: bufToBase64(row.userId as Buffer)}));
}

/**
 * Sync the submitted credential rows with the stored ones for a user.
 *
 * Rows carrying a `credentialId` are updated in place; rows without one are
 * inserted (hashing `password`/`secret` for `password`/`clientSecret` types);
 * stored rows absent from the submission are removed. Callers must only invoke
 * this when the form actually submitted a `credential` array (see the
 * `accessUserEdit` guard).
 */
export async function syncCredentials(
    qb: KnexQb,
    deps: {
        hashPassword: (
            password: string,
            salt: string,
            source?: Record<string, unknown> | null,
        ) => {hash: string; params: Record<string, unknown>};
        credentialPolicyParams: (qb: KnexQb, type: string) => Promise<Record<string, unknown>>;
    },
    userIdHex: string,
    rows: Array<Record<string, unknown>>,
): Promise<void> {
    const userIdBuf = Buffer.from(userIdHex, 'hex');
    const existing = (await qb('access_credential')
        .where('userId', userIdBuf)
        .select('credentialId')) as Array<{credentialId: number}>;
    const existingIds = new Set(existing.map(r => r.credentialId));
    const submittedIds = new Set<number>();
    for (const row of rows) {
        const credentialId = Number(row.credentialId);
        if (Number.isInteger(credentialId) && credentialId > 0) {
            submittedIds.add(credentialId);
            const patch: Record<string, unknown> = {};
            if (typeof row.credentialType === 'string') patch.credentialType = row.credentialType;
            if (row.isActive !== undefined) patch.isActive = row.isActive ? 1 : 0;
            if (row.expiresAt !== undefined) patch.expiresAt = row.expiresAt || null;
            if (Object.keys(patch).length) {
                await qb('access_credential').where('credentialId', credentialId).update(patch);
            }
        } else if (typeof row.credentialType === 'string' && row.credentialType) {
            // New credential — hash the secret so only the digest is stored.
            const secret =
                row.credentialType === 'google'
                    ? (row.googleSubjectId as string) || ''
                    : ((row.password ?? row.secret) as string) || '';
            const salt = account.newUuid();
            const policyParams = await deps.credentialPolicyParams(qb, row.credentialType);
            const {hash, params} = deps.hashPassword(secret, salt, policyParams);
            await qb('access_credential').insert({
                userId: userIdBuf,
                credentialType: row.credentialType,
                credentialHash: hash,
                credentialSalt: salt,
                // `*JSON` column — the knex adapter stores this object as JSON.
                credentialParamsJSON: params,
                isActive: row.isActive ? 1 : 0,
            });
        }
    }
    for (const id of existingIds) {
        if (!submittedIds.has(id)) {
            await qb('access_credential').where('credentialId', id).del();
        }
    }
}
