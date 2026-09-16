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

/** The verdict of the adapter's record-level ACL evaluation. */
export type AclCheckVerdict = {
    /** `false` when the entity does not opt into the ACL (or the action is not RBAC-managed). */
    guarded: boolean;
    allowed: boolean;
    /** The guarded entity (`subject.object`) the action belongs to. */
    entity?: string;
    /** The method's predicate (`get` / `edit` / `remove` / `add` / `find` / …). */
    predicate?: string;
    /** The resolved action resource — reused by `access.session.verify`. */
    actionId?: Buffer;
};

/**
 * The adapter's record-level ACL surface, reached through the port from a realm
 * handler (`this as unknown as AclHost`) — the runtime package is not a library
 * dependency of a realm, so this is the only way to reuse the SQL the generic
 * CRUD already applies.  See `core/blong-gogo/src/adapter/server/acl.ts`.
 */
export type AclHost = {
    aclCheck(
        params: {
            entity?: string;
            method?: string;
            recordId?: string;
            scopeIds?: string[];
            actorId?: string;
        },
        $meta?: IMeta,
    ): Promise<AclCheckVerdict>;
    /** Raw predicate + bindings for filtering a list — apply with `whereRaw`. */
    aclFilter(
        params: {entity: string; method?: string; actorId?: string},
        $meta?: IMeta,
    ): Promise<{sql: string; bindings: unknown[]} | undefined>;
};

/**
 * Join the display names of an ACL row's principal, action and target, so the
 * exceptions page and the effective panel are readable without a lookup per
 * row.  `joinResourceNames` covers the two resource id columns; the action name
 * needs its own lookup because `access_action`'s PK is the resource itself.
 */
export async function attachAclNames<T extends Record<string, unknown>>(
    qb: KnexQb,
    rows: T[],
): Promise<Array<T & {principalName?: string; actionName?: string; targetName?: string}>> {
    if (!rows.length) return rows;
    const withPrincipal = await joinResourceNames(qb, rows, 'principalId', 'principalName');
    const withTarget = await joinResourceNames(qb, withPrincipal, 'targetId', 'targetName');
    const actionIds = [
        ...new Set(
            withTarget
                .map(row => row.actionId)
                .filter((id): id is string => typeof id === 'string'),
        ),
    ];
    if (!actionIds.length) return withTarget;
    const actions = (await qb('access_action as at')
        .join('core_resource as r', 'r.resourceId', 'at.actionId')
        .whereIn(
            'at.actionId',
            actionIds.map(id => Buffer.from(binHex(id) as string, 'hex')),
        )
        .select('at.actionId', 'r.resourceName as actionName')) as Array<{
        actionId: Buffer;
        actionName: string;
    }>;
    const byId = new Map(actions.map(a => [bufToBase64(a.actionId), a.actionName]));
    return withTarget.map(row => ({
        ...row,
        actionName: byId.get(String(row.actionId)),
    }));
}

/**
 * Options for a dropdown listing graph resources of the given types, labelled
 * `<short type>: <resource name>` so an administrator can tell the kinds apart.
 */
/**
 * How a graph resource is labelled in the ACL dropdowns and in the ACL matrix:
 * `<short type>: <resource name>`, so an administrator can tell the kinds apart.
 */
export function resourceLabel(typeAlias: string, resourceName: string): string {
    const shortOf = new Map(
        Object.entries(SHORT_TYPE_ALIASES).map(([short, full]) => [full, short]),
    );
    return `${shortOf.get(typeAlias) ?? typeAlias}: ${resourceName}`;
}

export async function resourceOptions(
    qb: KnexQb,
    typeAliases: string[],
): Promise<Array<{value: string; label: string}>> {
    const rows = (await qb('core_resource as r')
        .join('core_type as t', 't.typeId', 'r.typeId')
        .whereIn('t.typeAlias', typeAliases)
        .select('r.resourceId', 'r.resourceName', 't.typeAlias')) as Array<{
        resourceId: Buffer;
        resourceName: string;
        typeAlias: string;
    }>;
    return rows
        .map(row => ({
            value: bufToBase64(row.resourceId) ?? '',
            label: resourceLabel(row.typeAlias, row.resourceName),
        }))
        .sort((a, b) => a.label.localeCompare(b.label));
}

/** The standard CRUD predicates a capability can grant in the action pivot grid. */
export const STANDARD_CRUD_PREDICATES = ['find', 'get', 'add', 'edit', 'remove'] as const;

/**
 * Highest usable role bit.  `access_role.roleBit` is the bit *position* of the
 * role in a minted token's `per` permission mask (`access.permission.list` packs
 * it into a 1024-bit mask), so the whole space has to stay inside it.
 */
export const ROLE_BIT_MAX = 1023;

/** Result of the shared `access.role.ensure` helper (see `accessRoleEnsure.ts`). */
export type EnsuredRole = {role: {roleId: string; roleName: string; roleBit: number}};

/**
 * Short type names used by ACL declarations, seeds and UI dropdowns, mapped to
 * the full `core_type.typeAlias` of the entity they refer to.
 */
export const SHORT_TYPE_ALIASES: Record<string, string> = {
    user: 'access.user',
    role: 'access.role',
    capability: 'access.capability',
    action: 'access.action',
    unit: 'party.unit',
    organization: 'party.organization',
    person: 'party.person',
    /** The wildcard target: an ACL rule anchored on it matches every record. */
    all: 'access.any',
};

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

/**
 * The verbs the ACL matrix exposes as tri-state columns. A cell is `''` (no
 * rule — the entity/verb is governed by RBAC alone), `allow` or `deny`.
 */
export const ACL_MATRIX_PREDICATES = STANDARD_CRUD_PREDICATES;

/** One row of the ACL matrix: a (target scope, entity) pair with verb cells. */
export type AclMatrixRow = {
    /** Target scope resource id (base64, as the wire round-trips it). */
    targetId?: string;
    /** Target scope display name (read-only, joined by `aclMatrixRows`). */
    targetName?: string;
    /** `accessUser`, `partyPerson`, … — the entity whose actions are restricted. */
    entityName?: string;
    [verb: string]: unknown;
};

/** The `(entity, verb) → effect` rules an ACL matrix row asks for. */
type DesiredAclRule = {actionHex: string; targetHex: string; effect: string};

/** Dependencies the ACL matrix sync needs from the calling handler. */
export type AclMatrixDeps = {
    /**
     * The bound `db/coreResourceEnsure` port handler.  Deliberately loose:
     * the port is generic in its result (`<T>(params, $meta) => Promise<T>`),
     * which is not assignable to a concrete function type — the params of a
     * narrower handler are contravariant, and the result widens to `unknown`.
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    coreResourceEnsure: (params: any, $meta: IMeta) => Promise<any>;
    /** Mints the `aclId` of a new rule (a ULID, as the column requires). */
    newAclId: () => Buffer;
};

/** `actionHex|targetHex` — the identity of a scope-level ACL rule. */
function aclRuleKey(actionHex: string, targetHex: string): string {
    return `${actionHex}|${targetHex}`;
}

/**
 * Split an action resource name into its entity + CRUD predicate, accepting both
 * the runtime's camelCase form (`partyPersonEdit`) and the dotted form the seeds
 * register (`party.person.edit`) — the ACL matches action names with the dots
 * ignored, so the matrix must read them the same way.
 */
export function aclActionParts(
    actionName: string,
): {entity: string; predicate: string} | undefined {
    const segments = actionName.split('.');
    if (segments.length > 1) {
        const predicate = segments[segments.length - 1];
        if (!(STANDARD_CRUD_PREDICATES as readonly string[]).includes(predicate)) {
            return undefined;
        }
        const entity = segments
            .slice(0, -1)
            .map((part, index) => (index === 0 ? part : part[0].toUpperCase() + part.slice(1)))
            .join('');
        return {entity, predicate};
    }
    return crudActionParts(actionName);
}

/**
 * The `access_action` resource id (hex) of one entity + CRUD verb, matched the
 * way the *runtime* matches it — the dots of `party.person.edit` are ignored, so
 * that action and `partyPersonEdit` are the same action.  An action the seeds
 * already registered is reused; one that does not exist yet is created.
 *
 * Matching instead of creating is essential: two rows with the same
 * dot-stripped name would make the runtime's pattern lookup pick either one, and
 * a rule pointing at the other would silently not apply.
 */
export async function aclActionResourceId(
    qb: KnexQb,
    coreResourceEnsure: AclMatrixDeps['coreResourceEnsure'],
    entityName: string,
    predicate: string,
    $meta: IMeta,
): Promise<string> {
    const actionName = crudActionName(entityName, predicate);
    const existing = (await qb('access_action as at')
        .join('core_resource as r', 'r.resourceId', 'at.actionId')
        .whereRaw("LOWER(REPLACE(r.resourceName, '.', '')) = ?", [
            actionName.replaceAll('.', '').toLowerCase(),
        ])
        .first('at.actionId as actionId')) as {actionId: Buffer} | undefined;
    const existingHex = binHex(existing?.actionId);
    if (existingHex) return existingHex;
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
    return hex;
}

/**
 * Read a principal's scope-level `access_acl` rules as ACL matrix rows: one row
 * per `(target scope, entity)` pair with a tri-state cell per CRUD verb, derived
 * from the action name (`accessUserFind` → entity `accessUser`, verb `find`).
 *
 * Only `targetKind: 'scope'` rules are returned — they are the ones the matrix
 * writes; `record` rules stay in the ACL Rules page, where the exact record is
 * chosen.
 *
 * The scope name is formatted exactly like the `access.aclTarget` dropdown's
 * option label ({@link resourceLabel}) — that label is the pivot's row identity,
 * so a bare `core_resource.resourceName` would never match its option and the
 * stored rules would render as an empty row.
 */
export async function aclMatrixRows(
    qb: KnexQb,
    principalId: Buffer | string,
): Promise<AclMatrixRow[]> {
    const hex = binHex(principalId);
    if (!hex) return [];
    const rows = (await qb('access_acl as ab')
        .join('core_resource as ar', 'ar.resourceId', 'ab.actionId')
        .where('ab.principalId', Buffer.from(hex, 'hex'))
        .where('ab.targetKind', 'scope')
        .where('ab.isActive', 1)
        .select(
            'ab.targetId as targetId',
            'ab.effect as effect',
            'ar.resourceName as actionName',
        )) as Array<{targetId: Buffer; effect: string; actionName: string}>;
    if (!rows.length) return [];
    const byKey = new Map<string, AclMatrixRow>();
    for (const row of rows) {
        const targetId = bufToBase64(row.targetId);
        const parts = aclActionParts(String(row.actionName));
        if (!targetId || !parts) continue;
        const key = `${targetId}|${parts.entity}`;
        let entry = byKey.get(key);
        if (!entry) {
            entry = {targetId, entityName: parts.entity};
            for (const p of ACL_MATRIX_PREDICATES) entry[p] = '';
            byKey.set(key, entry);
        }
        entry[parts.predicate] = row.effect === 'deny' ? 'deny' : 'allow';
    }
    const items = [...byKey.values()];
    const targetRows = (await qb('core_resource as r')
        .join('core_type as t', 't.typeId', 'r.typeId')
        .whereIn(
            'r.resourceId',
            items.map(item => Buffer.from(item.targetId as string, 'base64')),
        )
        .select(
            'r.resourceId as resourceId',
            'r.resourceName as resourceName',
            't.typeAlias as typeAlias',
        )) as Array<{
        resourceId: Buffer;
        resourceName: string;
        typeAlias: string;
    }>;
    const labelOf = new Map(
        targetRows.map(row => [
            bufToBase64(row.resourceId) ?? '',
            resourceLabel(row.typeAlias, row.resourceName),
        ]),
    );
    const named = items.map(item => ({...item, targetName: labelOf.get(item.targetId ?? '')}));
    return named
        .filter(item => item.targetName !== undefined)
        .sort(
            (a, b) =>
                String(a.targetName ?? '').localeCompare(String(b.targetName ?? '')) ||
                String(a.entityName ?? '').localeCompare(String(b.entityName ?? '')),
        );
}

/**
 * Bring a principal's scope-level `access_acl` rules in line with the submitted
 * ACL matrix.
 *
 * Each `allow`/`deny` cell ensures the `access` + `Entity` + capitalised verb
 * action resource (`partyPersonEdit`, …) and asks for the rule
 * `(principal, action, target scope, effect)`. An empty cell asks for the rule
 * to be gone, which is how an implicit grant is narrowed back and how an
 * explicitly forbidden record is released. Rules of other principals and
 * `record`-kind rules are never touched.
 */
export async function syncAclMatrix(
    qb: KnexQb,
    deps: AclMatrixDeps,
    principalId: Buffer | string,
    matrix: AclMatrixRow[],
    $meta: IMeta,
): Promise<void> {
    const principalHex = binHex(principalId);
    if (!principalHex) return;
    const principalBuf = Buffer.from(principalHex, 'hex');
    const desired = new Map<string, DesiredAclRule>();
    for (const row of matrix) {
        const targetHex = binHex(row.targetId);
        const entityName =
            typeof row.entityName === 'string' && row.entityName ? row.entityName : undefined;
        if (!targetHex || !entityName) continue;
        for (const p of ACL_MATRIX_PREDICATES) {
            const value = row[p];
            if (value !== 'allow' && value !== 'deny') continue;
            const actionHex = await aclActionResourceId(
                qb,
                deps.coreResourceEnsure,
                entityName,
                p,
                $meta,
            );
            desired.set(aclRuleKey(actionHex, targetHex), {
                actionHex,
                targetHex,
                effect: value,
            });
        }
    }
    const existing = (await qb('access_acl')
        .where('principalId', principalBuf)
        .where('targetKind', 'scope')
        .select('actionId as actionId', 'targetId as targetId', 'effect as effect')) as Array<{
        actionId: Buffer;
        targetId: Buffer;
        effect: string;
    }>;
    const existingEffects = new Map<string, string>();
    for (const row of existing) {
        const key = aclRuleKey(binHex(row.actionId) ?? '', binHex(row.targetId) ?? '');
        existingEffects.set(key, String(row.effect));
        if (desired.has(key)) continue;
        await qb('access_acl')
            .where('principalId', principalBuf)
            .where('targetKind', 'scope')
            .where('actionId', row.actionId)
            .where('targetId', row.targetId)
            .del();
    }
    for (const [key, rule] of desired) {
        const present = existingEffects.get(key);
        if (present === rule.effect) continue;
        if (present !== undefined) {
            await qb('access_acl')
                .where('principalId', principalBuf)
                .where('targetKind', 'scope')
                .where('actionId', Buffer.from(rule.actionHex, 'hex'))
                .where('targetId', Buffer.from(rule.targetHex, 'hex'))
                .update({effect: rule.effect, isActive: 1});
            continue;
        }
        await qb('access_acl')
            .insert({
                aclId: deps.newAclId(),
                principalId: principalBuf,
                actionId: Buffer.from(rule.actionHex, 'hex'),
                targetId: Buffer.from(rule.targetHex, 'hex'),
                targetKind: 'scope',
                effect: rule.effect,
                isActive: 1,
            })
            .onConflict()
            .ignore();
    }
}
