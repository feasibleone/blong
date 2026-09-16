import {crockfordDecode} from '@feasibleone/blong-lib';
import type {IObjectSchema, Knex} from '@feasibleone/blong/types';
import {methodParts} from '../../lib.ts';
import type {IAclAdapterConfig} from '../schema/knex/types.ts';

/**
 * Record-level (ACL) SQL helpers shared by the knex adapter's generic CRUD and
 * by realm handlers (through the `acl` library function in `blong-access`).
 *
 * The ACL itself is a single table (`access_acl` unless configured otherwise):
 *
 * ```
 * access_acl(aclId, principalId, actionId, targetId, targetKind, effect, isActive)
 * ```
 *
 * - `principalId` — a user, role, unit or capability resource id;
 * - `actionId`      — the `access_action` resource of the guarded method;
 * - `targetId`      — the guarded record, or a **scope** node (`targetKind`);
 * - `effect`        — `allow` / `deny`, where **deny always wins**.
 *
 * Two things grant access, and both narrow RBAC (a method the caller's action
 * list does not contain is refused by the gateway before this ever runs):
 *
 * - **implicit** — a `<principal> --hasScope--> <scope>` graph edge: the
 *   organizational/hierarchical grant, covering every action the principal
 *   holds.  The caller inherits the edges of its roles and units.
 * - **explicit** — an `access_acl` row targeting a scope or a single record,
 *   optionally turning an implicit allow off with `effect: 'deny'`.
 *
 * The record side is derived from the graph too: a record belongs to a scope
 * through one of the table's declared `scopes` predicates (`belongsTo`,
 * `isPartOf`, …), and a scope may itself sit under a parent scope — a grant on a
 * parent covers its descendants.
 *
 * All checks are plain SQL predicates evaluated by MySQL (no materialization of
 * the effective ACL), so they can be used both for a single-record check and as
 * a `WHERE` clause that filters a whole result set before paging.
 */

/** Resolved ACL rules (defaults match `realm/blong-access`). */
export interface IResolvedAclConfig {
    /** The ACL table. */
    table: string;
    /** The action entity table whose PK is the action resource. */
    actionTable: string;
    /** `core_path` pathType whose destinations are the caller's roles. */
    rolePathType: string;
    /** `core_path` pathType whose destinations are a node's scope ancestors (including itself). */
    scopePathType: string;
    /** `core_triple` predicate linking a principal to a unit. */
    unitPredicate: string;
    /** `core_triple` predicate linking a principal to a scope. */
    scopePredicate: string;
}

const ACL_DEFAULTS: IResolvedAclConfig = {
    table: 'access_acl',
    actionTable: 'access_action',
    rolePathType: 'access.effectiveRole',
    scopePathType: 'access.effectiveScope',
    unitPredicate: 'belongsTo',
    scopePredicate: 'hasScope',
};

/**
 * Merge the adapter's `schema.acl` block over the defaults, ignoring `undefined`
 * values so a partially-filled config cannot blank a default.
 */
export function aclConfig(config?: IAclAdapterConfig): IResolvedAclConfig {
    const defined = Object.fromEntries(
        Object.entries(config ?? {}).filter(([, value]) => value !== undefined && value !== null),
    ) as Partial<IResolvedAclConfig>;
    return {...ACL_DEFAULTS, ...defined};
}

/**
 * Binary resource id of the JWT `sub` claim.
 *
 * `sub` is crockford-encoded and `crockfordEncode` **reverses** the bytes, so
 * decoding round-trips to the DB byte order used by `core_path.originId` and
 * `core_triple.subjectId`.  Dashed UUIDs, hex and base64 strings are accepted
 * too (tests and internal callers).
 */
export function aclActorId(actorId: string): Buffer {
    const dashed = actorId.replaceAll('-', '');
    if (/^[0-9a-f]{32}$/i.test(dashed)) return Buffer.from(dashed, 'hex');
    try {
        const raw = crockfordDecode(actorId);
        if (raw.length === 16) return Buffer.from(raw);
    } catch {
        // Not crockford — fall through to the base64 attempt.
    }
    const base64 = Buffer.from(actorId, 'base64');
    if (base64.length === 16) return base64;
    throw new Error(`Cannot resolve a resource id from the actor id "${actorId}"`);
}

/**
 * The actor id of the caller (`$meta.auth.actorId`) — undefined when the call is
 * unauthenticated (e.g. a seed merge or an internal dispatch).
 */
export function aclActorOf($meta?: unknown): string | undefined {
    return ($meta as {auth?: {actorId?: string}} | undefined)?.auth?.actorId;
}

/**
 * The guarded entity (`subject.object`) a method belongs to — `accessUserEdit`
 * and `access.user.edit` both resolve to `access.user`.
 */
export function aclEntityOf(method: string): string | undefined {
    const bare = method.split('/').pop() ?? method;
    const parts = methodParts(bare).split('.');
    return parts.length >= 2 ? `${parts[0]}.${parts[1]}` : undefined;
}

/** The record key column of a table — its PK, defaulting to `${object}Id`. */
export function aclKeyColumn(objectSchema: IObjectSchema, subject: string, object: string): string {
    return (
        (objectSchema[subject]?.[object] as {constraints?: {primaryKey?: string}} | undefined)
            ?.constraints?.primaryKey ?? `${object}Id`
    );
}

/** Guard against a predicate/pathType config value breaking out of its SQL literal. */
function sqlLiteral(value: string, what: string): string {
    if (!/^[A-Za-z0-9_.-]+$/.test(value)) {
        throw new Error(
            `Invalid ACL ${what} "${value}" — only word characters, dot and dash are allowed`,
        );
    }
    return `'${value}'`;
}

function sqlList(values: string[], what: string): string {
    if (!values.length) throw new Error(`The ACL ${what} list is empty`);
    return values.map(value => sqlLiteral(value, what)).join(', ');
}

/**
 * Action resource id of a method.  The action name is matched the same way the
 * gateway matches method ids (dots stripped, lowercased) so `access.user.edit`
 * and `accessUserEdit` resolve to the same action.
 *
 * An `undefined` result means the method has **no `access_action` row at all** —
 * the realm does not manage it as an RBAC action (e.g. a plain table method), so
 * there is nothing for the ACL to match and the caller is allowed.  An action
 * that *does* exist but has no ACL row for the caller is a **denial**: opting a
 * table into the ACL (`mode: 'scoped' | 'explicit'`) is deny-by-default, with
 * the implicit `hasScope` grants and the explicit `allow` rows opening it up.
 */
export async function aclActionId(
    qb: Knex,
    cfg: IResolvedAclConfig,
    method: string,
): Promise<Buffer | undefined> {
    const row = (await qb
        .select('act.actionId')
        .from(`${cfg.actionTable} as act`)
        .join('core_resource as r', 'r.resourceId', 'act.actionId')
        .whereRaw("LOWER(REPLACE(r.resourceName, '.', '')) = ?", [
            method.replaceAll('.', '').toLowerCase(),
        ])
        .first()) as {actionId: Buffer} | undefined;
    return row?.actionId;
}

export interface IAclCheck {
    /** Raw SQL boolean expression — usable as a `SELECT` item or a `WHERE` clause. */
    sql: string;
    /** Positional bindings, in `?` order. */
    bindings: unknown[];
}

/**
 * The action resource name of a CRUD method following the repo-wide convention
 * (`subject` + `Object` + `Predicate`, e.g. `access` + `user` + `find` →
 * `accessUserFind`) — the same shape the gateway's `methodId` normalisation
 * makes equivalent to `access.user.find`.
 */
export function aclActionName(subject: string, object: string, predicate: string): string {
    const capitalise = (value: string): string => value[0].toUpperCase() + value.slice(1);
    return `${subject}${capitalise(object)}${capitalise(predicate)}`;
}

export interface IAclCheckOptions {
    cfg: IResolvedAclConfig;
    /** Binary resource id of the caller. */
    actorId: Buffer;
    /**
     * Binary resource id of the guarded action.  When `undefined` the action has
     * no ACL rows and the caller is allowed (RBAC already decided the verb).
     */
    actionId: Buffer | undefined;
    /**
     * How the guarded record is referenced: `'?'` (bind its binary id through
     * `recordId`) for a single-record check, or a column reference such as
     * `party_organization.organizationId` for a correlated list filter.  Omit it
     * for `add` — the record does not exist yet and only scopes can be targeted.
     */
    recordRef?: string;
    /** Binary record id — required when `recordRef` is `'?'`. */
    recordId?: Buffer;
    /** The guarded table's declared scope predicates (`belongsTo`, `isPartOf`, …). */
    scopes?: string[];
    /**
     * The record is its own scope (see `IAclTableSpec.selfScope`) — its scope set
     * is the record plus the parent scopes reachable from it, and any declared
     * `scopes` predicates are ignored.
     */
    selfScope?: boolean;
    /**
     * Explicit scope ids, replacing the record-derived scope set.  Used by `add`,
     * where the scope comes from the payload (`addScope`).
     */
    scopeIds?: Buffer[];
    /** `explicit` drops the implicit `<principal> --hasScope--> <scope>` grant. */
    mode: 'scoped' | 'explicit';
}

/**
 * The caller's principals: itself, its roles (from `core_path`), the units it
 * belongs to and those units' ancestors.
 *
 * `subjectColumn` names the principal column of the surrounding table — it is
 * `principalId` in the ACL table and `subjectId` in `core_triple`.
 */
function principalFilter(
    cfg: IResolvedAclConfig,
    actorId: Buffer,
    alias: string,
    subjectColumn: string,
): {sql: string; bindings: unknown[]} {
    const unitPredicate = sqlLiteral(cfg.unitPredicate, 'unit predicate');
    const units = `SELECT tu.objectId FROM core_triple tu WHERE tu.subjectId = ? AND tu.predicateName = ${unitPredicate}`;
    return {
        sql: `${alias}.${subjectColumn} = ? OR ${alias}.${subjectColumn} IN (
            SELECT pr.destinationId FROM core_path pr WHERE pr.originId = ? AND pr.pathType = ?
            UNION SELECT t.objectId FROM core_triple t WHERE t.subjectId = ? AND t.predicateName = ${unitPredicate}
            UNION SELECT pa.destinationId FROM core_path pa
                WHERE pa.pathType = ? AND pa.originId IN (${units})
        )`,
        bindings: [actorId, actorId, cfg.rolePathType, actorId, cfg.scopePathType, actorId],
    };
}

/**
 * The scopes a record participates in: its own scope edges (`belongsTo`,
 * `isPartOf`, …) plus every ancestor of those scopes — the materialized
 * `<scope> --isPartOf--> <parent>` chain, which includes each scope itself.
 *
 * `recordRef` is `'?'` (then the record id is bound twice) or a column reference
 * for a correlated list filter (then nothing is bound).
 */
function recordScopesSql(
    cfg: IResolvedAclConfig,
    scopes: string[],
    recordRef: string,
    recordId: Buffer | undefined,
): {sql: string; bindings: unknown[]} {
    const predicateList = sqlList(scopes, 'scope predicate');
    const refs = recordRef === '?' ? [recordId, recordId] : [];
    return {
        sql: `SELECT ts.objectId FROM core_triple ts
                WHERE ts.subjectId = ${recordRef} AND ts.predicateName IN (${predicateList})
            UNION SELECT pa.destinationId FROM core_path pa
                WHERE pa.pathType = ? AND pa.originId IN (
                    SELECT ps.objectId FROM core_triple ps
                    WHERE ps.subjectId = ${recordRef} AND ps.predicateName IN (${predicateList})
                )`,
        bindings: [...refs.slice(0, 1), cfg.scopePathType, ...refs.slice(1)],
    };
}

/**
 * The scope set of a record that *is* its own scope: the record plus its parent
 * scopes (the materialized scope path).  Used by tables whose scopes point at
 * them — `party.organization`, whose units carry `belongsTo` towards it — where
 * the record has no scope edge of its own to follow.
 */
function ownScopeSql(
    cfg: IResolvedAclConfig,
    recordRef: string,
    recordId: Buffer | undefined,
): {sql: string; bindings: unknown[]} {
    const refs = recordRef === '?' ? [recordId, recordId] : [];
    return {
        sql: `SELECT ${recordRef} AS objectId
            UNION SELECT pa.destinationId FROM core_path pa
                WHERE pa.pathType = ? AND pa.originId = ${recordRef}`,
        bindings: [...refs.slice(0, 1), cfg.scopePathType, ...refs.slice(1)],
    };
}

/** The scope set of an explicit list of scope ids: the ids themselves plus their ancestors. */
function explicitScopesSql(
    cfg: IResolvedAclConfig,
    scopeIds: Buffer[],
): {sql: string; bindings: unknown[]} {
    const ids = scopeIds.map(() => 'SELECT ? AS id').join(' UNION ');
    const placeholders = scopeIds.map(() => '?').join(', ');
    return {
        sql: `${ids}
            UNION SELECT pa.destinationId FROM core_path pa
                WHERE pa.pathType = ? AND pa.originId IN (${placeholders})`,
        bindings: [...scopeIds, cfg.scopePathType, ...scopeIds],
    };
}

/**
 * Build the boolean expression that decides whether the caller may act on the
 * record with the given action:
 *
 * ```sql
 * (implicit OR explicit-allow) AND NOT explicit-deny
 * ```
 *
 * `implicit` is a `hasScope` edge from one of the caller's principals to a scope
 * the record participates in; the explicit halves are `access_acl` rows
 * targeting the record itself or one of those scopes.  An unknown action (no
 * `actionId`) short-circuits to `TRUE` — RBAC already decided the verb.
 *
 * The SQL and its bindings are assembled strictly in placeholder order; every
 * fragment's bindings are spliced in exactly where its SQL text is spliced.
 */
export function aclCheckSql(options: IAclCheckOptions): IAclCheck {
    const {cfg, actorId, actionId, recordRef, mode} = options;
    if (!actionId) return {sql: 'TRUE', bindings: []};

    const scopeIds = options.scopeIds?.length ? options.scopeIds : undefined;
    const scopes = options.scopes ?? [];
    // Nothing to evaluate against: no record key and no scope.  Nothing can
    // match, so the answer is "denied" — a caller that forgot the target fails
    // here rather than being let through (see `access.session.verify`, which
    // turns this into a `recordRequired` refusal).
    if (!recordRef && !scopeIds) return {sql: 'FALSE', bindings: []};
    const scopeSet = scopeIds
        ? explicitScopesSql(cfg, scopeIds)
        : options.selfScope && recordRef
          ? ownScopeSql(cfg, recordRef, options.recordId)
          : mode === 'scoped' && recordRef && scopes.length
            ? recordScopesSql(cfg, scopes, recordRef, options.recordId)
            : undefined;

    // The target test: the record itself (when there is one) and/or the scopes
    // it participates in.  `add` has no record key yet, so only scopes.  A
    // wildcard rule (`targetKind: 'all'`, anchored on a sentinel node) matches
    // every record in every scope shape.  Built per alias so the allow (`a`) and
    // deny (`d`) sub-queries each refer to their own row.
    const targetOf = (alias: string): {sql: string; bindings: unknown[]} =>
        scopeSet
            ? {
                  sql: recordRef
                      ? `(${alias}.targetKind = 'all'
            OR (${alias}.targetKind = 'record' AND ${alias}.targetId = ${recordRef})
            OR (${alias}.targetKind = 'scope' AND ${alias}.targetId IN (${scopeSet.sql})))`
                      : `(${alias}.targetKind = 'all'
            OR (${alias}.targetKind = 'scope' AND ${alias}.targetId IN (${scopeSet.sql})))`,
                  bindings: [
                      ...(recordRef === '?' ? [options.recordId] : []),
                      ...scopeSet.bindings,
                  ],
              }
            : {
                  sql: `(${alias}.targetKind = 'all'
            OR (${alias}.targetKind = 'record' AND ${alias}.targetId = ${recordRef ?? '?'}))`,
                  bindings: recordRef ? [options.recordId] : [],
              };

    const explicit = (effect: 'allow' | 'deny', alias: string): IAclCheck => {
        const principals = principalFilter(cfg, actorId, alias, 'principalId');
        const target = targetOf(alias);
        return {
            sql: `EXISTS (SELECT 1 FROM ${cfg.table} ${alias}
                WHERE ${alias}.isActive = 1 AND ${alias}.effect = ${sqlLiteral(effect, 'effect')}
                    AND ${alias}.actionId = ?
                    AND (${principals.sql})
                    AND ${target.sql})`,
            bindings: [actionId, ...principals.bindings, ...target.bindings],
        };
    };

    const allow = explicit('allow', 'a');
    const deny = explicit('deny', 'd');

    // Implicit grant: <principal> --hasScope--> <scope of the record>.
    let implicit: IAclCheck | undefined;
    if (scopeSet && mode === 'scoped') {
        const principals = principalFilter(cfg, actorId, 'hs', 'subjectId');
        implicit = {
            sql: `EXISTS (SELECT 1 FROM core_triple hs
                WHERE hs.predicateName = ${sqlLiteral(cfg.scopePredicate, 'scope predicate')}
                    AND (${principals.sql})
                    AND hs.objectId IN (${scopeSet.sql}))`,
            bindings: [...principals.bindings, ...scopeSet.bindings],
        };
    }

    // A record that participates in no scope has nothing to narrow it against,
    // so RBAC alone decides it — the ACL restricts records *within* scopes.
    // This is what makes opting a table in safe for existing, unsorted data.
    const unscoped =
        recordRef && mode === 'scoped' && scopes.length
            ? {
                  sql: `NOT EXISTS (SELECT 1 FROM core_triple us
                    WHERE us.subjectId = ${recordRef}
                        AND us.predicateName IN (${sqlList(scopes, 'scope predicate')}))`,
                  bindings: recordRef === '?' ? [options.recordId] : [],
              }
            : undefined;

    const grant = implicit ? `(${implicit.sql}) OR (${allow.sql})` : `(${allow.sql})`;
    const guarded = `((${grant}) AND NOT (${deny.sql}))`;
    const sql = unscoped ? `((${unscoped.sql}) OR ${guarded})` : guarded;
    const bindings = [
        ...(unscoped?.bindings ?? []),
        ...(implicit?.bindings ?? []),
        ...allow.bindings,
        ...deny.bindings,
    ];
    const expected = sql.split('?').length - 1;
    if (expected !== bindings.length) {
        throw new Error(
            `ACL SQL placeholder mismatch: ${expected} placeholders, ${bindings.length} bindings`,
        );
    }
    return {sql, bindings};
}

/**
 * Evaluate the ACL for a single record (or a single scope, for `add`) in one
 * round trip.  Returns `true` when the caller may proceed.
 */
export async function aclAllowed(qb: Knex, options: IAclCheckOptions): Promise<boolean> {
    const {sql, bindings} = aclCheckSql(options);
    if (sql === 'TRUE') return true;
    const row = (await qb.select(qb.raw(`${sql} AS allowed`, bindings as never[])).first()) as
        | {allowed?: number | boolean | null}
        | undefined;
    return Boolean(row?.allowed);
}
