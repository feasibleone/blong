/**
 * apply.ts — the difference between the tree the plan describes and the state the
 * cluster holds.
 *
 * Like `plan.ts` and `generator.ts` this module sits at the realm root, outside every
 * layer folder, so the framework never scans it as a handler group. It is pure: it
 * reads a kustomize tree and a set of live objects and says what would have to change.
 * It makes no cluster call and holds no client, which is what lets the decision the
 * operator makes be tested without a cluster — and read before it is taken.
 *
 * Two ideas carry the weight:
 *
 * - **Ownership.** The operator applies the workload kinds the framework knows how to
 *   talk about, and nothing else. Cluster-scoped bootstrap objects (the namespace, the
 *   CRD) belong to the install, and the custom resource itself is the operator's input,
 *   not its output. Anything left over is reported as skipped with the reason, never
 *   silently dropped.
 * - **A fingerprint, not a diff.** Kubernetes adds defaults to almost every object it
 *   stores, so comparing a wanted manifest against a live one always differs and would
 *   re-apply forever. Each generated object therefore carries a hash of itself, and
 *   "changed" means "the hash differs" — the same trick that keeps GitOps tools from
 *   looping on API-server drift.
 */
import {createHash} from 'node:crypto';
import type {KustomizeResource, KustomizeTree} from './generator.ts';

/** The label carrying a manifest's own fingerprint. */
export const SPEC_HASH_LABEL = 'blong.feasible.one/spec-hash';

/** The label naming the suite a resource belongs to. */
export const PART_OF_LABEL = 'app.kubernetes.io/part-of';

/** The label that names one object, used to look a single one of a kind back up. */
export const NAME_LABEL = 'app.kubernetes.io/name';

/**
 * The label that names the *object*, which is what a lookup by identity wants.
 *
 * `NAME_LABEL` carries the suite, so a selector built from it and an object's own name matches
 * nothing at all: every generated object is labelled `name: <suite>` and `instance: <object name>`,
 * and the second one is what the step wait needs. It failed as a timeout rather than as a miss,
 * which is why the two are worth telling apart here.
 */
export const INSTANCE_LABEL = 'app.kubernetes.io/instance';

export interface IObjectMeta {
    name?: string;
    namespace?: string;
    labels?: Record<string, string>;
}

/** As much of a Kubernetes object as the operator reasons about. */
export interface IClusterObject {
    apiVersion?: string;
    kind?: string;
    metadata?: IObjectMeta;
    [key: string]: unknown;
}

/**
 * Kind → the resource type whose name the k8s adapter builds its verbs from.
 *
 * The adapter spells a request `<namespace>.<resourceType>.<verb>` (it reads the middle word to
 * pick an API and to look up the client's method), so this map is what makes `Deployment`
 * reachable as `cluster.deployment.apply`. A kind of several words keeps them apart with an `_`
 * — `persistent_volume_claim`, not `persistentvolumeclaim` — because that is what lets the adapter
 * join them into the client's own spelling (`PersistentVolumeClaim`): written as one lump the words
 * cannot be recovered, and `clusterPersistentVolumeClaimApply` resolves to
 * `cluster.persistent.volumeClaimApply`, whose middle word names no API at all (F-379). The
 * kind the tree carries is unaffected — this is the Blong name, not the Kubernetes one. Kinds the
 * adapter names no verbs for are absent rather than guessed: an omitted kind is reported, not
 * misapplied.
 */
export const RESOURCE_TYPE_BY_KIND: Record<string, string> = {
    PersistentVolumeClaim: 'persistent_volume_claim',
    ConfigMap: 'config_map',
    Secret: 'secret',
    Service: 'service',
    Role: 'role',
    ClusterRole: 'cluster_role',
    RoleBinding: 'role_binding',
    ClusterRoleBinding: 'cluster_role_binding',
    Deployment: 'deployment',
    DaemonSet: 'daemon_set',
    StatefulSet: 'stateful_set',
    Job: 'job',
    CronJob: 'cron_job',
    Ingress: 'ingress',
    NetworkPolicy: 'network_policy',
};

/**
 * Kinds the operator deliberately does not apply, and the reason it says so.
 *
 * These are not gaps to fill later: each one is owned by something else, and an
 * operator that applied them would be fighting the install.
 */
export const INSTALL_OWNED_KINDS: Record<string, string> = {
    Namespace: 'the install creates the suite namespace and owns its lifecycle',
    CustomResourceDefinition: 'the CRD is installed with the operator, not reconciled by it',
    BlongDeployment: "the custom resource is the operator's input, not its output",
    ServiceAccount:
        'the framework k8s adapter names no verb for a ServiceAccount; the install applies it',
    // The four objects that grant the operator its rights. Reconciling them would let the operator
    // widen its own Role — and in the cluster it is the one thing it is not allowed to write: a pass
    // died on `clusterroles.rbac.authorization.k8s.io is forbidden` for the ServiceAccount it runs
    // as. The install applies them, the same way it applies the CRD and the ServiceAccount they bind.
    Role: 'the install grants the rights; an operator that could rewrite them could widen them',
    RoleBinding:
        'the install grants the rights; an operator that could rewrite them could widen them',
    ClusterRole:
        'the install grants the rights; an operator that could rewrite them could widen them',
    ClusterRoleBinding:
        'the install grants the rights; an operator that could rewrite them could widen them',
};

/**
 * The resource types a pass sweeps for objects its declaration stopped naming.
 *
 * A pass looks up the kinds its *tree* names — and that is exactly what it cannot do when a kind
 * leaves the tree altogether: the credentials copy a switched-off service wrote into the suite's
 * namespace is a Secret, a tree with no Secret left in it never looks one up, and the copy is
 * orphaned by the pass that was supposed to remove it (found in the dev cluster, T-282). So the
 * sweep covers every kind a suite may own, whether or not this tree happens to name one.
 *
 * The install-owned kinds are left out: they are applied by the install, not by a pass, and sweeping
 * them would have the operator delete the Role it runs under.
 */
export const sweptResourceTypes = (): string[] =>
    Object.entries(RESOURCE_TYPE_BY_KIND)
        .filter(([kind]) => !INSTALL_OWNED_KINDS[kind])
        .map(([, resourceType]) => resourceType);

/** A kustomize document is a manifest to apply, or a build instruction to skip. */
export const isClusterResource = (resource: KustomizeResource): resource is IClusterObject =>
    typeof resource === 'object' &&
    resource !== null &&    typeof (resource as IClusterObject).kind === 'string' &&
    typeof (resource as IClusterObject).apiVersion === 'string' &&
    !String((resource as IClusterObject).apiVersion).startsWith('kustomize.config.k8s.io/');

/**
 * Dependencies first, so one pass converges: the volume before the pods that mount it,
 * the Services before the Ingress that points at them, and the Ingress last.
 */
export const APPLY_ORDER: string[] = [
    'PersistentVolumeClaim',
    'ConfigMap',
    'Secret',
    // A Job is a step, not a process: the seed fills the volume and the migration brings the schema
    // up to date, and both have to have happened before anything rolls out and reads them.
    'Job',
    'Deployment',
    'DaemonSet',
    'StatefulSet',
    'CronJob',
    'Ingress',
];

export const applyOrder = (kind: string): number => {
    const index = APPLY_ORDER.indexOf(kind);
    return index < 0 ? APPLY_ORDER.length : index;
};

/**
 * How the cluster names an object: kind, namespace and name.
 *
 * The kind is asked for rather than trusted, because a list answer does not carry one: the API
 * returns `kind` on every item, but what reaches here is `metadata`, `spec` and `status` and
 * nothing that names the type (T-226, first seen as `created 18` beside `obsolete 18` for every
 * kind the plan touches). A caller that listed one type at a time knows the answer already, which
 * is why it is a parameter and not a lookup.
 */
export const resourceKey = (object: IClusterObject, kind?: string): string =>
    `${object.kind ?? kind ?? '?'}/${object.metadata?.namespace ?? ''}/${
        object.metadata?.name ?? ''
    }`;

/**
 * Stable JSON: keys sorted at every level, so moving a field in the source that builds a
 * manifest does not change its fingerprint. Without this the hash would depend on
 * property order, and reordering an object literal would look like a spec change.
 */
const canonical = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === 'object') {
        const record = value as Record<string, unknown>;
        return Object.fromEntries(
            Object.keys(record)
                .sort()
                .map(key => [key, canonical(record[key])]),
        );
    }
    return value;
};

export const specHashOf = (object: IClusterObject): string | undefined =>
    object.metadata?.labels?.[SPEC_HASH_LABEL];

/**
 * Add the fingerprint to a manifest, replacing one already there.
 *
 * The hash covers the object without the label itself — otherwise it would depend on
 * its own value — and is truncated to 16 hex characters: long enough that a collision
 * is not a practical concern, short enough to read in `kubectl describe`.
 */
export const stampSpecHash = <T extends IClusterObject>(object: T): T => {
    const labels = {...object.metadata?.labels};
    delete labels[SPEC_HASH_LABEL];
    const bare = {...object, metadata: {...object.metadata, labels}};
    const hash = createHash('sha256')
        .update(JSON.stringify(canonical(bare)))
        .digest('hex')
        .slice(0, 16);
    return {
        ...bare,
        metadata: {...object.metadata, labels: {...labels, [SPEC_HASH_LABEL]: hash}},
    } as T;
};

/** A manifest the plan wants in the cluster, with the vocabulary to place it there. */
export interface IDesiredResource {
    /** Tree-relative path, so a failure or a skip names the file it came from. */
    path: string;
    object: IClusterObject;
    kind: string;
    resourceType: string;
}

export interface ISkippedResource {
    path: string;
    kind: string;
    reason: string;
}

export interface ICollected {
    managed: IDesiredResource[];
    skipped: ISkippedResource[];
}

/**
 * Split a tree into what the operator applies and what it explains.
 *
 * Sorted by `APPLY_ORDER` and then by path, so two runs over the same plan produce the
 * same sequence of calls — which is what makes a reconcile reproducible rather than
 * merely correct.
 */
export const collectManifests = (tree: KustomizeTree): ICollected => {
    const managed: IDesiredResource[] = [];
    const skipped: ISkippedResource[] = [];
    for (const [path, resource] of tree) {
        if (!isClusterResource(resource)) continue;
        const kind = String(resource.kind);
        const owned = INSTALL_OWNED_KINDS[kind];
        if (owned) {
            skipped.push({path, kind, reason: owned});
            continue;
        }
        const resourceType = RESOURCE_TYPE_BY_KIND[kind];
        if (!resourceType) {
            skipped.push({
                path,
                kind,
                reason: 'the framework k8s adapter names no verbs for this kind; the install owns it',
            });
            continue;
        }
        managed.push({path, object: resource, kind, resourceType});
    }
    managed.sort((a, b) => applyOrder(a.kind) - applyOrder(b.kind) || a.path.localeCompare(b.path));
    return {managed, skipped};
};

export interface IDiff {
    create: IDesiredResource[];
    update: IDesiredResource[];
    unchanged: IDesiredResource[];
    obsolete: IClusterObject[];
}

/** As much of a pod template as a reference check reads. */
interface IPodSpec {
    serviceAccountName?: string;
    volumes?: Array<{name?: string; persistentVolumeClaim?: {claimName?: string}}>;
    containers?: Array<{volumeMounts?: Array<{name?: string}>}>;
}

const podSpecsOf = (object: IClusterObject): IPodSpec[] => {
    const spec = object.spec as
        | {template?: {spec?: IPodSpec}; jobTemplate?: {spec?: {template?: {spec?: IPodSpec}}}}
        | undefined;
    const specs: IPodSpec[] = [];
    if (spec?.template?.spec) specs.push(spec.template.spec);
    // A CronJob puts its Job one level deeper, which is the one place the shape differs.
    const cron = spec?.jobTemplate?.spec?.template?.spec;
    if (cron) specs.push(cron);
    return specs;
};

const labelsOf = (object: IClusterObject): Record<string, string> =>
    ((object.spec as {template?: {metadata?: {labels?: Record<string, string>}}} | undefined)
        ?.template?.metadata?.labels ?? {}) as Record<string, string>;

/**
 * Every reference inside a tree that points at nothing in that tree.
 *
 * A generated tree is a graph, and the interesting failures are its dangling edges: a mount that
 * names no volume, a Service whose selector matches no pod, an Ingress whose backend names no
 * Service. All three shipped at least once in this realm's short life, each silently — a pod with
 * an unmounted path runs, a Service with no endpoints answers nothing, and an Ingress with a missing
 * backend is a 503 from the controller rather than an error from `kubectl apply`. None of them needs
 * a cluster to see, which is why this is a pure function over the tree and not a check inside a
 * reconcile pass (T-242).
 *
 * Deliberately *not* checked, because a finding would be wrong more often than right:
 *
 * - a `secretKeyRef` or a claim the tree does not create itself. The rc files and the gateway keys
 *   are the tenant's, the install owns the claim, and the tree names them on purpose.
 * - a Service that selects labels no Deployment carries *in this tree*, when the Deployment comes
 *   from another tree in the same namespace (the operator's install). Only Services and the pods
 *   generated beside them are compared, and the finding says which pair disagreed.
 */
export const danglingReferences = (tree: KustomizeTree): string[] => {
    const findings: string[] = [];
    const documents = [...tree.entries()]
        .filter(([, resource]) => isClusterResource(resource))
        .map(([path, resource]) => ({path, object: resource as IClusterObject}));

    const services = documents.filter(({object}) => object.kind === 'Service');
    const serviceNames = new Set(services.map(({object}) => object.metadata?.name));
    const podOwners = documents.filter(({object}) =>
        ['Deployment', 'DaemonSet', 'StatefulSet', 'Job', 'CronJob'].includes(String(object.kind)),
    );

    for (const {path, object} of podOwners) {
        for (const spec of podSpecsOf(object)) {
            const declared = new Set((spec.volumes ?? []).map(volume => volume.name));
            for (const container of spec.containers ?? []) {
                for (const mount of container.volumeMounts ?? []) {
                    if (mount.name && !declared.has(mount.name)) {
                        findings.push(
                            `${path}: a container mounts volume "${mount.name}", which nothing declares`,
                        );
                    }
                }
            }
        }
    }

    for (const {path, object} of services) {
        const selector = (object.spec as {selector?: Record<string, string>} | undefined)?.selector;
        if (!selector || !Object.keys(selector).length) continue;
        const matched = podOwners.some(({object: owner}) =>
            Object.entries(selector).every(([key, value]) => labelsOf(owner)[key] === value),
        );
        if (!matched) {
            findings.push(
                `${path}: nothing in this tree carries ${Object.entries(selector)
                    .map(([key, value]) => `${key}=${value}`)
                    .join(', ')}`,
            );
        }
    }

    for (const {path, object} of documents.filter(({object}) => object.kind === 'Ingress')) {
        const rules = (
            object.spec as
                | {
                      rules?: Array<{
                          http?: {
                              paths?: Array<{backend?: {service?: {name?: string}}; path?: string}>;
                          };
                      }>;
                  }
                | undefined
        )?.rules;
        for (const rule of rules ?? []) {
            for (const entry of rule.http?.paths ?? []) {
                const backend = entry.backend?.service?.name;
                if (backend && !serviceNames.has(backend)) {
                    findings.push(
                        `${path}: the path "${entry.path}" points at Service "${backend}", which this tree does not define`,
                    );
                }
            }
        }
    }

    return findings;
};

/**
 * What to create, what to update, what is already right, and what no longer belongs.
 *
 * The caller lists the cluster through a label selector, so everything it hands over is
 * something the suite owns: a live object the plan no longer mentions is obsolete rather
 * than a stranger. That precondition is what makes deletion safe to offer at all, and
 * deletion still has to be asked for separately.
 */
export const diffResources = (desired: IDesiredResource[], live: IClusterObject[]): IDiff => {
    // The group listed one type, so the type is a given for the live side: without it every live
    // object keys as `?/` and nothing ever matches, which reads as a plan that wants everything
    // created and sees everything it owns as obsolete.
    const kind = desired[0]?.kind;
    const remaining = new Map(live.map(object => [resourceKey(object, kind), object]));
    const create: IDesiredResource[] = [];
    const update: IDesiredResource[] = [];
    const unchanged: IDesiredResource[] = [];
    for (const entry of desired) {
        const key = resourceKey(entry.object);
        const found = remaining.get(key);
        if (!found) {
            create.push(entry);
            continue;
        }
        remaining.delete(key);
        const wanted = specHashOf(entry.object);
        // A live object with no fingerprint was made by something else (the install, or a
        // hand-run kubectl), so it is updated rather than assumed to match.
        if (wanted && specHashOf(found) === wanted) unchanged.push(entry);
        else update.push(entry);
    }
    return {create, update, unchanged, obsolete: [...remaining.values()]};
};

/** The parameter object the k8s adapter's apply verb expects. */
export const applyParams = (entry: IDesiredResource): Record<string, unknown> => ({
    name: entry.object.metadata?.name,
    namespace: entry.object.metadata?.namespace,
    manifest: entry.object,
});
