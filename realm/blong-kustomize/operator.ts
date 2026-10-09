/**
 * operator.ts — what the suite's operator is allowed to do.
 *
 * The realm applies manifests on the suite's behalf, so it needs write verbs that the
 * deployment UI deliberately does not have. That is two identities rather than one
 * widened one (D-373): the `rbac/` objects in `generator.ts` stay read-only and belong to
 * the UI, and the operator gets its own ServiceAccount, Role, RoleBinding, ClusterRole
 * and ClusterRoleBinding from here.
 *
 * This module holds the policy only — the permission lists and the names they bind to —
 * because that is the part worth reading on its own. The object shapes are built in
 * `generator.ts`, beside every other manifest.
 */

/** The suffix naming the operator's objects, inside the namespace and across the cluster. */
export const OPERATOR_SUFFIX = '-operator';

/**
 * The operator's name, wherever it is installed.
 *
 * Static on purpose, and the reason one operator serves a cluster: tooling has to be able to name it
 * without first discovering which suite happens to be deployed — kubectl, an alert, a runbook. The
 * suite a CR belongs to is in the CR's labels, not in the operator's name (Phase 15 A, D-396).
 */
export const OPERATOR_NAME = 'blong-operator';

/** The namespace the operator is installed into: one per cluster, beside nothing else. */
export const OPERATOR_NAMESPACE = 'blong-system';

/** The custom resource the CRD installs, as the operator's cluster role must spell it. */
export const OPERATOR_GROUP = 'blong.feasible.one';
export const OPERATOR_PLURAL = 'blongdeployments';
/**
 * The served version of that resource.
 *
 * Named once because three places have to agree on it: the CRD says which version it serves, the CR
 * says which one it is an instance of, and the loop has to name it to read either — the cluster
 * adapter reaches a custom resource only through the group, version and plural, which is also how
 * the watch verb builds its path.
 */
export const OPERATOR_VERSION = 'v1alpha1';

export interface IPolicyRule {
    apiGroups: string[];
    resources: string[];
    verbs: string[];
}

/** Reading and converging: what a reconcile pass needs and nothing beyond it. */
const WRITE = ['get', 'list', 'watch', 'create', 'update', 'patch', 'delete'];

/**
 * The namespaced kinds the apply half touches, grouped by the API that serves them.
 *
 * These are the resource types `apply.ts` maps generated kinds onto, so a kind the
 * operator can apply is a kind it may write: the two lists are one decision seen from two
 * sides, and a kind added to one without the other fails at apply time with a 403 rather
 * than at review time.
 */
export const OPERATOR_NAMESPACED_RULES: IPolicyRule[] = [
    {
        apiGroups: [''],
        resources: ['services', 'configmaps', 'secrets', 'persistentvolumeclaims'],
        verbs: WRITE,
    },
    {
        apiGroups: ['apps'],
        resources: ['deployments', 'daemonsets', 'statefulsets'],
        verbs: WRITE,
    },
    {apiGroups: ['batch'], resources: ['jobs', 'cronjobs'], verbs: WRITE},
    {
        apiGroups: ['networking.k8s.io'],
        resources: ['ingresses', 'networkpolicies'],
        verbs: WRITE,
    },
];

/**
 * The environment the operator's container is started with.
 *
 * The image owns the command line, so a process switch has to travel in the environment — and the
 * port reads these same names, which is what keeps the generated Deployment and the code that obeys
 * it from drifting apart. The suite's own config wins over them, so a developer can run a loop
 * locally by configuring it rather than by exporting anything.
 */
export const OPERATOR_ENV = {
    /** Seconds between reconcile passes. */
    intervalSeconds: 'BLONG_CONTROLLER_INTERVAL',
    /** `cr` to reconcile the suite's custom resource, `registry` to reconcile what is loaded. */
    from: 'BLONG_CONTROLLER_FROM',
    /** `true` to let a pass change the cluster, `false` to only report. */
    apply: 'BLONG_CONTROLLER_APPLY',
    /**
     * `true` to let a pass remove what the declaration stopped naming.
     *
     * A word of its own rather than part of `apply`, because a converge and a removal are different
     * intentions: the second one cannot be walked back, and a deployment may want its processes
     * updated without anything ever being deleted. Deletion is scoped to the suite's namespace
     * (D-461).
     */
    prune: 'BLONG_CONTROLLER_PRUNE',
} as const;

/**
 * The two identity questions, and the one verb each needs.
 *
 * The login verifies a presented token with a `TokenReview` and asks what that identity may do with
 * a `SubjectAccessReview` (D-376). Both objects are cluster-scoped and neither is about a resource,
 * so both are granted by a `ClusterRole`: the tenant's own (`auth-review`, bound to the tenant's
 * identity — see `generator.ts`), and the operator's, whose portal login asks the same two questions
 * about the callers that reach it. One list for both identities, because the permission is one fact —
 * it is exactly what the cluster's own `system:auth-delegator` role grants, spelled out rather than
 * bound, so a suite does not depend on a role it does not control.
 *
 * `create` alone: reading a review back is not part of asking the question, and the API server
 * answers the create with the verdict.
 */
export const AUTH_REVIEW_RULES: IPolicyRule[] = [
    {apiGroups: ['authentication.k8s.io'], resources: ['tokenreviews'], verbs: ['create']},
    {apiGroups: ['authorization.k8s.io'], resources: ['subjectaccessreviews'], verbs: ['create']},
];

/**
 * The custom resource, which is cluster-scoped, and its status.
 *
 * The status is a subresource of its own: a role that can write the spec but not the
 * status reports nothing back, and one that can write the status can pass a deployment
 * off as reconciled without touching it.
 *
 * The review rules join them because the operator is also what serves its own deployment UI, and
 * that UI's login is the realm's cluster-backed one: without the two rules the portal answers
 * `k8s.forbidden` while every other part of the install works (F-430). The operator's
 * ClusterRoleBinding already names its service account, so the rights arrive with an install the
 * cluster has anyway.
 */
export const OPERATOR_CLUSTER_RULES: IPolicyRule[] = [
    {apiGroups: [OPERATOR_GROUP], resources: [OPERATOR_PLURAL], verbs: WRITE},
    {
        apiGroups: [OPERATOR_GROUP],
        resources: [`${OPERATOR_PLURAL}/status`],
        verbs: ['get', 'update', 'patch'],
    },
    ...AUTH_REVIEW_RULES,
];

/**
 * How a suite is doing, in the four words a reader can act on.
 *
 * `Progressing` is not only what a stalled pass says: a suite that has just been applied is not
 * ready yet, because a Deployment is available or it is not, and a pass that has to wait for one
 * would be a pass that pretends the cluster is faster than it is.
 */
export type StatusPhase = 'Pending' | 'Progressing' | 'Ready' | 'Failed';

/** What a pass leaves behind for a reader of the CR — the counts, and when they were counted. */
export interface IStatusResult {
    at: string;
    created: number;
    updated: number;
    unchanged: number;
    obsolete: number;
    /** What the pass removed: obsolete objects inside the suite's namespace (D-461). */
    deleted: number;
    failures: number;
}
