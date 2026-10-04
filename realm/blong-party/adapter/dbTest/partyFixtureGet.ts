import {type IMeta, handler} from '@feasibleone/blong';

// The knex query builder is intentionally untyped here (matches the access realm's db handlers).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type KnexQb = any;

/** The declared edges the ACL matrices are built from. */
const DEFAULT_PREDICATES = ['belongsTo', 'isPartOf', 'hasRole', 'hasScope', 'hasCapability'];

/** The sentinel type of a wildcard rule target (`targetKind: 'all'`). */
const ANY_TARGET_TYPE = 'access.any';

/** One declared edge — `<subject> --<predicate>--> <object>`, by name and type. */
export interface IAclFact {
    subject: string;
    subjectType: string;
    predicate: string;
    object: string;
    objectType: string;
}

/** One explicit `access_acl` rule, with its principal, action and target named. */
export interface IAclRule {
    principal: string;
    principalType: string;
    action: string;
    target: string;
    /** `record` — a single record; `scope` — every record linked to it; `all` — the wildcard. */
    targetKind: string;
    effect: string;
}

/** A graph node by name — enough to assert that a fixture row exists and is of the right type. */
export interface IAclResource {
    resourceName: string;
    typeAlias: string;
}

/** The `clientId` of an `access_user` profile, which is what a service account authenticates with. */
export interface IAclClientId {
    resourceName: string;
    clientId: string | null;
}

/**
 * `party.fixture.get` — the records and triples an ACL matrix is built from,
 * by **name**, so a Gherkin table can assert the fixture it claims to have.
 *
 * The matrix asserts an *outcome* (`party.person.get` allowed / denied); this
 * reads the *cause*: the `belongsTo` / `isPartOf` hierarchy, the `hasRole`,
 * `hasScope` and `hasCapability` grants, the `access_acl` rules and the
 * `clientId` a service account presents.  Everything is resolved through
 * `core_resource.resourceName`, which is the name the feature files use, so a
 * fixture table needs no ids.
 *
 * `names` limits every query to the records the fixture table mentions, and the
 * facts are then *complete* for those subjects — a cell states every target, so
 * an edge the fixture does not declare is a mismatch rather than an extra.
 *
 * Wire: `party.fixture.get` — read by the shared `aclFixture` library of the ACL
 * matrix tests (`browser/test/test/aclFixture.ts`).  The name is three words on
 * purpose: `methodParts` (`core/blong-gogo/src/lib.ts`) splits subject, object
 * and predicate out of the handler name, and a fourth word would glue itself to
 * the predicate (`partyAclFixtureGet` → `party.acl.fixtureGet`).  Lives in
 * `adapter/dbTest/` because it is TEST-ONLY: the db adapter imports `.dbTest`
 * handler groups only under `dev`, never in production.  It needs the
 * `matrixFixtureRead` capability, seeded by `21-aclMatrix-accessAuthorizationMerge.yaml`.
 */
export default handler(() => ({
    async partyFixtureGet(
        params: {names: string[]; predicates?: string[]},
        _$meta: IMeta,
    ): Promise<{
        resources: IAclResource[];
        facts: IAclFact[];
        rules: IAclRule[];
        clientIds: IAclClientId[];
    }> {
        const qb: KnexQb = this.config?.context?.queryBuilder;
        if (!qb) throw new Error('Database not available');

        const names = [...new Set(params.names.filter(name => name.trim() !== ''))];
        const predicates = params.predicates ?? DEFAULT_PREDICATES;
        if (!names.length) return {resources: [], facts: [], rules: [], clientIds: []};

        const resources = (await qb('core_resource as r')
            .join('core_type as t', 't.typeId', 'r.typeId')
            .whereIn('r.resourceName', names)
            .select('r.resourceName', 't.typeAlias')) as IAclResource[];

        const facts = (await qb('core_triple as tr')
            .join('core_resource as rs', 'rs.resourceId', 'tr.subjectId')
            .join('core_type as ts', 'ts.typeId', 'rs.typeId')
            .join('core_resource as ro', 'ro.resourceId', 'tr.objectId')
            .join('core_type as to_', 'to_.typeId', 'ro.typeId')
            .whereIn('rs.resourceName', names)
            .whereIn('tr.predicateName', predicates)
            .select(
                'rs.resourceName as subject',
                'ts.typeAlias as subjectType',
                'tr.predicateName as predicate',
                'ro.resourceName as object',
                'to_.typeAlias as objectType',
            )) as IAclFact[];

        // An `access_user` profile is bound to the resource it acts as, so its
        // name IS that resource's name — a unit's account has no name of its own.
        const clientIds = (await qb('access_user as u')
            .join('core_resource as r', 'r.resourceId', 'u.userId')
            .whereIn('r.resourceName', names)
            .select('r.resourceName', 'u.clientId')) as IAclClientId[];

        const rules = (
            (await qb('access_acl as ab')
                .join('core_resource as pr', 'pr.resourceId', 'ab.principalId')
                .join('core_type as pt', 'pt.typeId', 'pr.typeId')
                .join('core_resource as ar', 'ar.resourceId', 'ab.actionId')
                .join('core_resource as tr_', 'tr_.resourceId', 'ab.targetId')
                .join('core_type as tt', 'tt.typeId', 'tr_.typeId')
                .whereIn('pr.resourceName', names)
                .where('ab.isActive', 1)
                .select(
                    'pr.resourceName as principal',
                    'pt.typeAlias as principalType',
                    'ar.resourceName as action',
                    'tr_.resourceName as target',
                    'tt.typeAlias as targetType',
                    'ab.targetKind as targetKind',
                    'ab.effect as effect',
                )) as Array<IAclRule & {targetType: string}>
        ).map(({targetType, ...rule}) => ({
            ...rule,
            // The wildcard target is anchored on a sentinel node; a table reads
            // better as `*` than as its description.
            target: targetType === ANY_TARGET_TYPE ? '*' : rule.target,
        }));

        return {resources, facts, rules, clientIds};
    },
}));
