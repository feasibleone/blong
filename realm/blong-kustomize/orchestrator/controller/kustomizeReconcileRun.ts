import {handler, type IMeta} from '@feasibleone/blong';
import {
    GATEWAY_KEYS_LABEL,
    GENERATED_CREDENTIALS_LABEL,
    INSTANCE_LABEL,
    PART_OF_LABEL,
    RESOURCE_TYPE_BY_KIND,
    applyParams,
    collectManifests,
    diffResources,
    resourceKey,
    sweptResourceTypes,
    type IClusterObject,
    type IDesiredResource,
} from '../../apply.ts';
import {buildKustomizeTree, type KustomizeTree} from '../../generator.ts';
import {
    OPERATOR_GROUP,
    OPERATOR_NAMESPACE,
    OPERATOR_PLURAL,
    OPERATOR_VERSION,
    type StatusPhase,
} from '../../operator.ts';
import type {IBlongDeploymentSpec, IDescribeCapable, IPlanConfig} from '../../plan.ts';
import {
    DEFAULT_ATTEMPT_RETENTION,
    clusterNodeNames,
    planFromRegistry,
    planOptionsFromSpec,
    planOptionsOf,
    registryView,
    resolveNodes,
} from '../../plan.ts';
import {DEFAULT_SERVICES_NAMESPACE} from '../../services.ts';

type ClusterCall = (params: unknown, $meta: IMeta) => Promise<unknown>;

const message = (error: unknown): string =>
    error instanceof Error ? error.message : String(error);

/**
 * Which of a deploy's older Job attempts a prune may remove (@@D-386, Q6).
 *
 * The tree's own Job is the *current* attempt and is never obsolete; what reaches this function are
 * the attempts a previous generation created, newest first by creation time. The newest
 * `retention - 1` of them stay, because the current attempt counts towards the retention, and the
 * failures among them stay too: a Job that failed is what a failed deploy is read from, and the
 * reason it can be kept at all is that the name carries the attempt, so a retry never collides with
 * it.
 *
 * Pure and exported for the reason `kustomize.volume.prune` computes rather than deletes: a policy
 * should be testable without a cluster, and only the pass may delete.
 */
export const jobAttemptsPastRetention = (
    obsolete: IClusterObject[],
    retention: number,
): IClusterObject[] => {
    const keep = Math.max(0, Math.max(1, retention) - 1);
    return [...obsolete]
        .sort((left, right) => timestampOf(right).localeCompare(timestampOf(left)))
        .slice(keep);
};

/** One listing a pass needs: a resource type, the namespace to look in, and what it wants there. */
export interface IListingScope {
    resourceType: string;
    namespace: string;
    desired: IDesiredResource[];
    /**
     * Whether this scope exists only to find what a declaration stopped generating.
     *
     * Such a scope holds nothing the tree asks for: a switched-off service leaves a credential in a
     * namespace no object of this deployment is declared in, and the pass looks there to take it
     * back. A namespace nothing creates answers `forbidden` rather than `not found` — the API server
     * cannot tell the two apart — so a pass that failed on this scope would report a deployment as
     * failed while everything it asks for is applied. It is still named with the other listings.
     */
    cleanupOnly?: boolean;
}

/** The listings a pass needs, one per resource type _and namespace_ (@@T-282 @@D-464). */
export const listingScopes = (
    managed: IDesiredResource[],
    swept: readonly string[],
    tenantNamespace: string,
    servicesNamespace?: string,
): IListingScope[] => {
    const scopes = new Map<string, IListingScope>();
    const scopeOf = (
        resourceType: string,
        namespace: string,
        cleanupOnly = false,
    ): IListingScope => {
        // One scope per pair, joined on a NUL: a resource type and a namespace are DNS-ish names, so
        // neither can contain one, and the pair stays unambiguous without a second map.
        const key = `${resourceType}\u0000${namespace}`;
        const scope = scopes.get(key) ?? {resourceType, namespace, desired: [], cleanupOnly};
        scopes.set(key, scope);
        return scope;
    };
    for (const entry of managed) {
        const namespace = entry.object.metadata?.namespace ?? tenantNamespace;
        scopeOf(entry.resourceType, namespace).desired.push(entry);
    }
    for (const resourceType of swept) {
        // One scope per kind is enough for a sweep, and a kind the tree names is already scoped by
        // the objects that name it.
        if ([...scopes.values()].some(scope => scope.resourceType === resourceType)) continue;
        scopeOf(resourceType, tenantNamespace);
    }
    // And the credentials a deployment generated in the namespace its services run in. A service the
    // declaration switched off names nothing there, so no object scopes that namespace and the pass
    // cannot see what it wrote — which is how a generated Secret outlived the definition it was
    // derived from. Only the credential kind is listed there, and only a labelled object is removable
    // once it is seen, so the shared namespace stays its owner's to edit (`prunable`, @@D-461 @@D-509).
    if (servicesNamespace && servicesNamespace !== tenantNamespace) {
        scopeOf(RESOURCE_TYPE_BY_KIND['Secret'] ?? 'secret', servicesNamespace, true);
    }
    return [...scopes.values()];
};

/**
 * The scopes a pass could not read that leave it failed.
 *
 * A scope the pass added only to find what a declaration stopped generating does not: nothing of this
 * deployment is expected in it, and the namespace a switched-off service left behind answers
 * `forbidden` rather than `not found`, so counting it would report every pass as failed while
 * everything the declaration asks for is applied. Every other unreadable scope is a failure, because
 * an object of this deployment may be in it unseen (@@F-461 @@D-515).
 */
export const unreadableFailures = (
    unreadable: ReadonlyArray<{key: string; message: string; cleanupOnly: boolean}>,
): Array<{key: string; message: string}> =>
    unreadable.filter(entry => !entry.cleanupOnly).map(({key, message}) => ({key, message}));

/**
 * Which listing a CR pass reads: the namespace it knows, or every CR the operator can see.
 */
export const crListingScope = ({
    named,
    configured,
    held,
}: {
    /** The namespace the caller named, if it named one. */
    named?: string;
    /** The namespace this process is configured with. */
    configured: string;
    /** How many CRs the configured namespace holds. */
    held: number;
}): {scope: string; namespaced: boolean} =>
    named === undefined && held === 0
        ? {scope: 'any namespace', namespaced: false}
        : {scope: named ?? configured, namespaced: true};

/**
 *
 * Pairing is by namespace *and* name: two Deployments of one name in two namespaces are two objects,
 * and a listing that answered for one of them says nothing about the other. A Deployment no listing
 * mentioned reads as zero, which is what a suite that has not rolled out yet looks like.
 *
 * Pure and exported for the reason the scope is: this is the half a cluster is not needed for, and it
 * is the half that decided a CR could not leave `Progressing` (a backing service's Deployment was
 * looked for in the tenant's namespace, so it answered zero replicas for ever).
 */
export const availableReplicas = (
    targets: Array<{name: string; namespace: string}>,
    listings: Array<{namespace: string; items: IClusterObject[]}>,
): Array<{name: string; available: number}> => {
    const replicas = new Map<string, number>();
    for (const {namespace, items} of listings) {
        for (const item of items) {
            const status = item.status as {availableReplicas?: number} | undefined;
            replicas.set(
                `${namespace}/${String(item.metadata?.name ?? '')}`,
                Number(status?.availableReplicas ?? 0),
            );
        }
    }
    return targets.map(target => ({
        name: target.name,
        available: replicas.get(`${target.namespace}/${target.name}`) ?? 0,
    }));
};

/**
 * Which objects a plan no longer mentions a pass may remove — only the suite's own namespace
 * (@@D-461).
 */
export const prunable = (obsolete: IClusterObject[], namespace: string): IClusterObject[] =>
    obsolete.filter(
        object =>
            object.metadata?.namespace === namespace ||
            object.metadata?.labels?.[GENERATED_CREDENTIALS_LABEL] !== undefined,
    );

/** The label a fill Job carries: how many volume directories — one per identity — a node keeps. */
export const VOLUME_RETENTION_LABEL = 'blong.feasible.one/retention';

/** The label an attempt Job carries: how many attempts of one step a suite keeps (@@D-471). */
export const ATTEMPT_RETENTION_LABEL = 'blong.feasible.one/attempt-retention';

/** The labels a retention step reads, and therefore the objects obsolescence leaves alone. */
const RETENTION_LABELS = [VOLUME_RETENTION_LABEL, ATTEMPT_RETENTION_LABEL];

/**
 * Whether an object is one a retention step keeps a count of.
 *
 * The test behind `prunableByObsolescence`, and the one the install sweep filters with, which is why
 * it is written out once: an object counts as retired by retention only when it says so itself, and
 * everything else in a namespace is nobody's to delete by that rule.
 */
export const hasRetentionLabel = (object: IClusterObject): boolean =>
    RETENTION_LABELS.some(label => object.metadata?.labels?.[label] !== undefined);

/**
 * The obsolete objects a pass may remove by obsolescence on its own.
 *
 * Everything except the objects a retention step retires. An object carrying either retention label is
 * counted by whoever reads that number — how many volume directories to keep, how many Job attempts —
 * and a tree names one identity at a time, which makes every other identity look obsolete to a pass
 * that diffed without reading the label. So the volumes a suite is not currently running, and the
 * attempts a previous deploy left, are left to their own steps, and only the objects nothing else
 * decides are removed here (@@T-282 @@D-464 @@D-471).
 */
export const prunableByObsolescence = (obsolete: IClusterObject[]): IClusterObject[] =>
    obsolete.filter(
        object =>
            !hasRetentionLabel(object) &&
            // The gateway key pair is written by a pass rather than by the tree, so a listing that can
            // see it does not make it obsolete: it is held while its declaration exists and removed
            // with it, which is what its owner reference is for .
            object.metadata?.labels?.[GATEWAY_KEYS_LABEL] === undefined,
    );

const timestampOf = (object: IClusterObject): string =>
    String((object.metadata as {creationTimestamp?: string} | undefined)?.creationTimestamp ?? '');

/**
 * Whether an existing object of this kind can be told to become the desired one.
 *
 * Not for a Job: `batch/v1` refuses a change to `spec.template`, and the name already carries the
 * attempt (`jobName` hashes what the Job runs), so a Job whose name is in the cluster *is* this
 * attempt — the pass waits on it rather than replacing it. Updating it used to be what the diff
 * produced for an unchanged attempt, and the API server answered `Job.batch "…" is invalid:
 * spec.template: Invalid value: field is immutable`, which the pass reported as a failed step and the
 * CR as a failed deploy (@@F-406). A changed attempt is a different name, and arrives as a create.
 */
export const appliesUpdate = (resourceType: string): boolean => resourceType !== 'job';

/**
 * The retention the objects declare about themselves.
 *
 * Read off a Job rather than taken from the plan, because a CR-driven pass never sees the plan its
 * tree was generated from — it applies the tree a child composed — while every object the generator
 * emits carries `blong.feasible.one/retention` for exactly this kind of reader.
 */
export const retentionOf = (objects: IClusterObject[], fallback = 3): number => {
    const declared = objects
        .map(object => Number(object.metadata?.labels?.[VOLUME_RETENTION_LABEL]))
        .find(value => Number.isFinite(value) && value >= 1);
    return declared ?? fallback;
};

/**
 * The attempt retention the objects declare about themselves.
 *
 * A second reader for a second number (@@D-471): the Jobs carry how many attempts to keep and the volumes
 * carry how many directories, and one knob for both is how a suite that kept three volumes kept three
 * attempts. Read off the objects for the same reason the volumes' is: a CR-driven pass never sees the
 * plan its tree was generated from.
 */
export const attemptRetentionOf = (
    objects: IClusterObject[],
    fallback = DEFAULT_ATTEMPT_RETENTION,
): number => {
    const declared = objects
        .map(object => Number(object.metadata?.labels?.[ATTEMPT_RETENTION_LABEL]))
        .find(value => Number.isFinite(value) && value >= 1);
    return declared ?? fallback;
};

/**
 * The node a fill Job is pinned to, read off the selector the generator wrote.
 *
 * Not parsed out of the name: the name carries the artifact identity, which is a version and a token
 * (`1.13.0-8bb99e44`), and the node is a hostname — both contain hyphens, so no split of the name can
 * tell where one ends. The selector is what the generator itself uses to pin the Job to the node whose
 * directory it fills, and the directory is a node's own, so the node is the only key the count can use.
 */
const fillNodeOf = (object: IClusterObject): string => {
    const spec = object.spec as
        | {template?: {spec?: {nodeSelector?: Record<string, string>}}}
        | undefined;
    return String(spec?.template?.spec?.nodeSelector?.['kubernetes.io/hostname'] ?? '');
};

/**
 * Which of a suite's older fill Jobs a prune may remove (@@D-471).
 *
 * The rule the volume retention states, and the one the attempt rule cannot express: one fill Job per
 * node, so the number is kept *per node* — three means three identities' Jobs on that node, the current
 * identity included — while a pair may legitimately be uneven, because a node that missed a deploy fills
 * its directory the next time the suite runs there. Newest first by creation time, and `retention - 1` of
 * the obsolete ones stay, for the reason the attempts' rule gives: the current identity counts too.
 */
export const fillJobsPastRetention = (
    obsolete: IClusterObject[],
    retention: number,
): IClusterObject[] => {
    const keep = Math.max(0, Math.max(1, retention) - 1);
    const byNode = new Map<string, IClusterObject[]>();
    for (const object of obsolete) {
        const node = fillNodeOf(object);
        byNode.set(node, [...(byNode.get(node) ?? []), object]);
    }
    return [...byNode.values()].flatMap(perNode =>
        [...perNode]
            .sort((left, right) => timestampOf(right).localeCompare(timestampOf(left)))
            .slice(keep),
    );
};

/**
 * Which of a group's obsolete Jobs the pass may remove.
 *
 * Two numbers and two rules, told apart by the label the generator wrote rather than by the name: an
 * attempt carries `attempt-retention` and is counted with the other attempts of its step, a fill Job
 * carries `retention` and is counted per node, and a Job carrying neither — every Job before the two
 * numbers existed — is retired as an attempt, which is what the pass did for all of them (@@D-471).
 */
export const jobsPastRetention = (obsolete: IClusterObject[]): IClusterObject[] => {
    const carries = (object: IClusterObject, label: string): boolean =>
        object.metadata?.labels?.[label] !== undefined;
    const fill = obsolete.filter(object => carries(object, VOLUME_RETENTION_LABEL));
    const rest = obsolete.filter(object => !carries(object, VOLUME_RETENTION_LABEL));
    return [
        ...fillJobsPastRetention(fill, retentionOf(fill)),
        ...jobAttemptsPastRetention(rest, attemptRetentionOf(rest)),
    ];
};

/**
 * The name the k8s adapter answers to for one resource type and one verb.
 *
 * The adapter reads the middle word of the triple it is called with to pick an API and a method,
 * so `cluster.deployment.apply` reaches the apps API and `cluster.persistent_volume_claim.apply`
 * the core one — and an unregistered name falls back to the adapter's `exec`, which is the whole
 * point. A resource type of several words keeps its separator and capitalises each word, because
 * that is what tells the framework's name splitter the words are one part rather than two:
 * `clusterPersistentVolumeClaimApply` reads as `cluster.persistent.volumeClaimApply`, whose middle
 * word matches no API (@@F-395). The framework's own k8s tests call single-word resources the same
 * way (`clusterPodFind`, `clusterPodLog`), so the realm can apply a kind without importing a
 * Kubernetes client of its own.
 */
const wireName = (resourceType: string, verb: string): string =>
    `cluster${resourceType
        .split('_')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join('_')}${verb}`;

/**
 * kustomize.reconcile.run — one pass of the operator's loop; a CR pass converges on the deployed
 * design, and `apply`/`prune` guard the destructive half (@@D-488).
 */
export default handler(({handler}) => {
    const call = (name: string): ClusterCall | undefined => {
        const candidate = (handler as Record<string, unknown>)[name];
        return typeof candidate === 'function' ? (candidate as ClusterCall) : undefined;
    };

    /**
     * The tree for a CR, asked for by name like a cluster verb.
     *
     * A CR pass does not plan: this process is not running the suite it reconciles, so the tree comes
     * from `kustomize.suite.generate`, which loads the target suite's artifact in a short-lived child
     * (@@D-395). Reaching it through the proxy keeps this handler free of a reference to it, the
     * same rule the cluster verbs follow.
     */
    const suiteGenerate = (params: object, meta: IMeta): Promise<unknown> => {
        const candidate = call('kustomizeSuiteGenerate');
        if (!candidate) throw new Error('kustomize.suite.generate is not loaded');
        return candidate(params, meta);
    };

    /** How long a step may take before a reconcile reports it rather than waiting on it. */
    const STEP_TIMEOUT_SECONDS = 300;
    const STEP_POLL_MILLIS = 3000;

    /**
     * How many replicas of each Deployment the plan wants are actually available.
     *
     * A phase is only worth writing if it says where the suite stands, and a Deployment applied a
     * second ago has no available replicas yet: the count is the evidence and the phase is the
     * summary of it. Each one is read in the namespace it names rather than in the tenant's, because
     * a suite's Deployments do not all live beside its workloads — a backing service runs in the
     * services namespace — and a Deployment looked for in the wrong place answers zero replicas for
     * ever, which is a CR that never leaves `Progressing` however healthy the suite is.
     *
     * A failure to list answers zeroes rather than throwing — a status that could not be counted
     * should say so, not take the pass down with it.
     */
    const deploymentAvailability = async (
        wanted: IDesiredResource[],
        tenantNamespace: string,
        meta: IMeta,
    ): Promise<Array<{name: string; available: number}>> => {
        const targets = wanted.map(entry => ({
            name: String(entry.object.metadata?.name ?? ''),
            namespace: entry.object.metadata?.namespace ?? tenantNamespace,
        }));
        if (!targets.length) return [];
        const find = call('clusterDeploymentFind');
        if (!find) return targets.map(target => ({name: target.name, available: 0}));
        // One listing per namespace, which is the scoping the pass itself reads through
        // (`listingScopes`): where a Deployment lives is what a listing needs to find it.
        const listings: Array<{namespace: string; items: IClusterObject[]}> = [];
        for (const namespace of new Set(targets.map(target => target.namespace))) {
            try {
                const found = (await find({namespace}, meta)) as {items?: IClusterObject[]};
                listings.push({namespace, items: found?.items ?? []});
            } catch {
                // A namespace that could not be listed answers nothing, which reads as no available
                // replicas rather than as a failed pass.
            }
        }
        return availableReplicas(targets, listings);
    };

    /**
     * Wait for a Job to finish.
     *
     * The API server answers "created", not "done": a reconcile that applies a Job and moves on has
     * only started the step, while everything after it in APPLY_ORDER reads what the step writes.
     * Found through the label that names the object itself, because the lookup answers a namespace
     * listing and a suite with a seed step and a migration step has two Jobs to tell apart — while
     * the suite's own name label is the same on both and selects neither. When nothing matches, the
     * wait polls and then reports the timeout, so the timeout message carries the number of objects
     * the lookup saw: a lookup that matches nothing and a step that never finishes read the same in
     * a bare "did not finish" .
     */
    const waitForStep = async (
        object: IClusterObject,
        find: ClusterCall | undefined,
        $meta: IMeta,
    ): Promise<string | undefined> => {
        if (!find) return 'no lookup verb to wait on';
        const name = object.metadata?.name ?? '';
        const deadline = Date.now() + STEP_TIMEOUT_SECONDS * 1000;
        let looked = 0;
        for (;;) {
            const found = (await find(
                {
                    namespace: object.metadata?.namespace,
                    labelSelector: `${INSTANCE_LABEL}=${name}`,
                },
                $meta,
            )) as {
                items?: Array<{
                    status?: {
                        succeeded?: number;
                        conditions?: Array<{type?: string; status?: string; reason?: string}>;
                    };
                }>;
            };
            looked = found?.items?.length ?? 0;
            const status = found?.items?.[0]?.status;
            const failed = status?.conditions?.find(
                condition => condition.type === 'Failed' && condition.status === 'True',
            );
            if (failed) return `the step failed: ${failed.reason ?? 'no reason given'}`;
            if ((status?.succeeded ?? 0) > 0) return undefined;
            if (Date.now() > deadline)
                return (
                    `the step did not finish within ${STEP_TIMEOUT_SECONDS}s ` +
                    `(the lookup answered ${looked} object(s) for ` +
                    `${INSTANCE_LABEL}=${name})`
                );
            await new Promise(resolve => setTimeout(resolve, STEP_POLL_MILLIS));
        }
    };

    return {
        async kustomizeReconcileRun(
            params: {
                apply?: boolean;
                prune?: boolean;
                from?: 'registry' | 'cr';
                /**
                 * Which CR to reconcile. One operator serves many suites, so a pass names the one
                 * it was triggered by; without a name it takes the first CR in the namespace, which
                 * is what a hand-run pass and the realm's own tests want.
                 */
                name?: string;
                /** The CR's namespace — the tenant. Falls back to the configured suite namespace. */
                namespace?: string;
                /** Where artifacts are cached and trees are written; the realm config decides. */
                cacheDir?: string;
            } = {},
            $meta?: IMeta,
        ): Promise<{
            reconciled: number;
            applied: boolean;
            origin?: 'registry' | 'cr';
            /**
             * Which CR the pass reconciled, when it read one.
             *
             * The caller that named one does not need it back; the caller that named none — the
             * deployment page's button, which reconciles whatever the operator serves — does, and so
             * does anyone reading a log line about a pass that read a declaration .
             */
            suite?: {name?: string; namespace?: string};
            created?: number;
            updated?: number;
            unchanged?: number;
            obsolete?: number;
            deleted?: number;
            skipped?: string[];
            failures?: Array<{key: string; message: string}>;
            reason?: string;
        }> {
            const self = this as unknown as {registry?: IDescribeCapable; config?: IPlanConfig};
            const meta = $meta as IMeta;
            // Two origins for the same plan: the config this process loaded, and the CR it is
            // reconciling. The registry is what the suite actually runs; the CR is the declaration
            // an operator was handed. Reading the second one closes the loop the CRD opened, and
            // anything the CR does not name stays with the config rather than falling to a default
            // .
            const options = planOptionsOf(self.config);
            let origin: 'registry' | 'cr' = 'registry';
            // Kept out here because the status is written at the end of the pass, back to the CR the
            // pass was triggered by — and only a CR pass has one.
            let declared: IBlongDeploymentSpec | undefined;
            let declaredName: string | undefined;
            /** The declaration's `uid`, which is what an object it owns is removed by . */
            let declaredUid: string | undefined;
            if (params.from === 'cr') {
                // `custom` is the resource type a custom resource reaches the adapter as — not the
                // kind, which is not a name it knows. The coordinates below are what it reads the
                // object with, and without them it has nothing to build a path from.
                const list = call('clusterCustomFind');
                if (!list) {
                    return {
                        reconciled: 0,
                        applied: false,
                        reason: 'the cluster adapter is not loaded',
                    };
                }
                const tenant = params.namespace ?? options.namespace ?? options.suiteName;
                // The coordinates, not just the namespace: the adapter reaches a custom resource
                // through its group, version and plural, and a `BlongDeployment` is not a kind it
                // knows from the client's own API list. Held once because the two listings below
                // differ only in the scope they name.
                const coordinates = {
                    group: OPERATOR_GROUP,
                    version: OPERATOR_VERSION,
                    plural: OPERATOR_PLURAL,
                };
                const listing = async (scope: object) =>
                    (await list({...coordinates, ...scope}, meta)) as {
                        items?: Array<{
                            metadata?: {name?: string; namespace?: string; uid?: string};
                            spec?: IBlongDeploymentSpec;
                        }>;
                    };
                // The narrow question first, and only widened when nobody named a namespace and that
                // one holds nothing — see `crListingScope`, which is where the rule is written down.
                let found = await listing({namespace: tenant});
                const {scope, namespaced} = crListingScope({
                    named: params.namespace,
                    configured: tenant,
                    held: found?.items?.length ?? 0,
                });
                if (!namespaced) {
                    const all = await listing({namespaced: false});
                    if (all?.items?.length) found = all;
                }
                // Filtered here rather than in the API call: the adapter's find answers a list, and
                // one namespace holds one suite in practice, so a name is a lookup into a handful of
                // items rather than a reason for a second verb. The item is kept whole because the
                // status is written back to the object it was read from.
                const item = found?.items?.find(
                    entry => params.name === undefined || entry.metadata?.name === params.name,
                );
                declared = item?.spec;
                declaredName = item?.metadata?.name;
                // The listing type names only what the pass reads for the plan; the uid is what an
                // owner reference needs, and it comes from the same object .
                declaredUid = item?.metadata?.uid;
                if (!declared) {
                    return {
                        reconciled: 0,
                        applied: false,
                        reason: params.name
                            ? `no BlongDeployment ${params.name} in ${scope}`
                            : `no BlongDeployment names a suite in ${scope}`,
                    };
                }
                // The CR's namespace is the tenant: the suite deploys where it was declared, not
                // where this process happens to be configured — which is what the cluster-wide
                // listing above has to hand back rather than the namespace it searched.
                options.namespace = item?.metadata?.namespace ?? tenant;
                Object.assign(options, planOptionsFromSpec(declared));
                origin = 'cr';
            }
            // A registry pass reconciles the suite *this process is*, so a process that declares no
            // suite entry has no tree of its own to apply: running this realm's CLI against a cluster
            // planned the realm's own ports — `blong`, `codec`, `kustomize` — and deployed them as a
            // suite's workloads into whatever namespace it was handed (@@F-406), and the failure was
            // silent, because a pass reports what it created. Refused rather than narrowed by
            // namespace: a namespace says where a pass may write, not whether it has a suite to
            // write .
            if (origin === 'registry' && !options.entry) {
                return {
                    reconciled: 0,
                    applied: false,
                    reason:
                        'a registry pass reconciles the suite this process is, and this process ' +
                        'declares no suite entry (`--kustomize.deploy.suite.entry`)',
                };
            }
            // Where the tree comes from is the whole difference between the two origins. A pass from
            // the registry plans in-process, because that process *is* the suite. A pass from a CR
            // must not: the operator is installed once and reconciles suites it does not hold, so the
            // tree is written by a short-lived child that loads that suite's artifact, and this
            // process applies what the child wrote (@@D-395).
            const suiteName = declaredName ?? options.suiteName;
            const suiteNamespace = options.namespace ?? options.suiteName;
            let tree: KustomizeTree;
            if (origin === 'cr' && declared) {
                const generated = (await suiteGenerate(
                    {
                        spec: declared,
                        name: suiteName,
                        namespace: suiteNamespace,
                        cacheDir: params.cacheDir,
                    },
                    meta,
                )) as {tree: KustomizeTree};
                tree = generated.tree;
            } else {
                // A pass this process plans itself has to be *told* the nodes: it is not the run that
                // wrote the tree, and a `nodeLocal` volume is one directory per node (@@D-470). The CR
                // wins where it names them, the realm's config answers otherwise, and the cluster is
                // asked only for a selector . A CR pass needs none of this: it asks
                // `kustomize.suite.generate` for a tree, and that leg reads the same source itself.
                const nodeFind = call('clusterNodeFind');
                options.nodes = await resolveNodes(options.nodeSource, async selector => {
                    if (!nodeFind) return undefined;
                    const found = (await nodeFind({labelSelector: selector}, $meta as IMeta)) as {
                        items?: unknown[];
                    };
                    return clusterNodeNames(found);
                });
                tree = buildKustomizeTree(planFromRegistry(registryView(self.registry), options));
            }
            const {managed, skipped} = collectManifests(tree);

            // A pass says what it was asked to do before it does it. The controller logs what the
            // call answered, which is not the same thing: while the dispatch was broken (@@T-225) that
            // line reported a pass that had run and changed nothing, and the only way to tell it
            // apart from a pass that never ran was to look here.
            (this as unknown as {log?: {info?: (entry: object) => void}}).log?.info?.({
                $meta: {mtid: 'event', method: 'kustomize.reconcile.run'},
                message:
                    `reconcile: reading from ${origin}, apply ${params.apply === true}, ` +
                    `prune ${params.prune === true}: ${managed.length} managed, ` +
                    `${skipped.length} skipped`,
            });

            // One listing per resource type *and namespace*, selected by ownership: everything the
            // label returns belongs to this suite, which is what lets a live object the plan no
            // longer mentions be treated as obsolete rather than as a stranger. Which namespaces
            // those are is `listingScopes`' answer, and it is the objects that give it.
            const groups: Array<{
                resourceType: string;
                namespace: string;
                desired: IDesiredResource[];
                live: IClusterObject[];
            }> = [];
            // A scope the pass cannot read is a failure of that scope, not the end of the pass: what
            // it cannot see is reported, and everything else in the tree is still applied. A
            // namespace whose Rights went with it is the case (@@F-461), and it is worth naming — the
            // alternative is a pass that dies before it writes a status, leaving a CR that describes
            // a cluster nobody has since.
            const unreadable: Array<{key: string; message: string; cleanupOnly: boolean}> = [];
            for (const scope of listingScopes(
                managed,
                sweptResourceTypes(),
                suiteNamespace,
                options.servicesNamespace ?? DEFAULT_SERVICES_NAMESPACE,
            )) {
                const find = call(wireName(scope.resourceType, 'Find'));
                if (!find) {
                    // A kind the tree names and the cluster cannot look up is a pass that would apply
                    // what it cannot reconcile, so it says so. One only the sweep is interested in is
                    // skipped: the adapter does not answer for it either way.
                    if (!scope.desired.length) continue;
                    return {
                        reconciled: 0,
                        applied: false,
                        reason: `the cluster adapter does not answer ${scope.resourceType} lookups`,
                    };
                }
                let found: {items?: IClusterObject[]} | undefined;
                try {
                    found = (await find(
                        {
                            namespace: scope.namespace,
                            labelSelector: `${PART_OF_LABEL}=${suiteName}`,
                        },
                        meta,
                    )) as {items?: IClusterObject[]};
                } catch (error) {
                    unreadable.push({
                        key: `${scope.namespace}/${scope.resourceType}`,
                        message: message(error),
                        cleanupOnly: scope.cleanupOnly === true,
                    });
                    continue;
                }
                groups.push({
                    resourceType: scope.resourceType,
                    namespace: scope.namespace,
                    desired: scope.desired,
                    live: found?.items ?? [],
                });
            }

            // What the sweep found, per kind the tree does not name at all.
            //
            // The tally below reports what the diff decided, not what the listing returned, and the
            // two disagree in the case that matters: an object the tree no longer mentions that the
            // listing did not return looks exactly like one that was never listed, so `0 obsolete`
            // beside a surviving credentials Secret says nothing about why it survived. The counts
            // are named here, once per pass, which is what separates a listing that came back empty
            // (the object wears labels this suite does not own, or the scope asked the wrong
            // namespace) from one that was never made. The namespace is part of the entry because it
            // is the fact in doubt: a kind the tree stopped naming still has to be looked for where
            // the object was left — and a scope that could not be read at all is named beside the
            // counts rather than left to the status, where `0` would read as `nothing was there`.
            const swept = groups
                .filter(group => !group.desired.length)
                .map(group => `${group.namespace}/${group.resourceType}=${group.live.length}`);
            if (swept.length || unreadable.length) {
                (this as unknown as {log?: {info?: (entry: object) => void}}).log?.info?.({
                    $meta: {mtid: 'event', method: 'kustomize.reconcile.run'},
                    message:
                        `reconcile: the tree names none of these, so the listing is all ` +
                        `there is (namespace/kind=count): ${swept.join(', ')}` +
                        (unreadable.length
                            ? `; unreadable: ${unreadable
                                  .map(entry =>
                                      entry.cleanupOnly
                                          ? `${entry.key} (${entry.message}; cleanup only)`
                                          : `${entry.key} (${entry.message})`,
                                  )
                                  .join('; ')}`
                            : ''),
                });
            }

            const readOnly = !params.apply;

            /**
             * The suite's keys, before the processes that read them.
             *
             * The tree cannot carry them — a regenerated tree must be byte-identical, which the
             * realm's tests pin — so the deployment creates them, and it has to create them *before*
             * the Deployments: a pod that comes up in this same pass would otherwise hold only the
             * framework's per-process fallback, and the browser session opened against it would
             * belong to that one replica until it restarts . A read-only pass creates nothing,
             * the same rule pruning follows.
             */
            let keys: {name: string; created: boolean; reason?: string} | undefined;
            if (!readOnly) {
                const ensure = call('kustomizeGatewayKeysEnsure') as unknown as
                    | ((
                          params: {
                              namespace: string;
                              suite?: string;
                              owner?: {name: string; uid: string};
                          },
                          $meta?: IMeta,
                      ) => Promise<typeof keys>)
                    | undefined;
                // The pair is the pass's to write and the declaration's to own: a CR pass hands it
                // the object it read, so Kubernetes removes the Secret with it, while a registry pass
                // read no declaration and claims no owner.
                const owner =
                    declaredName && declaredUid
                        ? {name: declaredName, uid: declaredUid}
                        : undefined;
                keys = ensure
                    ? await ensure({namespace: suiteNamespace, suite: suiteName, owner}, meta)
                    : undefined;
            }
            let created = 0;
            let updated = 0;
            let unchanged = 0;
            let obsolete = 0;
            let deleted = 0;
            const failures: Array<{key: string; message: string}> = unreadableFailures(unreadable);
            /**
             * Per kind, so a count that looks wrong can be traced to the kind that produced it.
             *
             * `18 created beside 18 obsolete` says only that _something_ is compared wrongly; the
             * kind it happens to says whether it is the name, the namespace or the kind string, and
             * finding that out from the log beats reading the diff code again.
             */
            const tally: string[] = [];

            for (const group of groups) {
                const diff = diffResources(group.desired, group.live);
                const toApply = appliesUpdate(group.resourceType) ? diff.update : [];
                created += diff.create.length;
                updated += toApply.length;
                unchanged += diff.unchanged.length + (diff.update.length - toApply.length);
                obsolete += diff.obsolete.length;
                if (diff.create.length || diff.obsolete.length) {
                    tally.push(
                        `${group.resourceType} +${diff.create.length}/-${diff.obsolete.length}`,
                    );
                }
                // The same count on both sides means the keys never matched, and the pair says which
                // part of the key did it — the kind string, the namespace, or the name the plan
                // derives. Logged only in that state, so a healthy pass stays quiet and a broken one
                // names itself on the first run .
                if (diff.create.length && diff.obsolete.length) {
                    (this as unknown as {log?: {info?: (entry: object) => void}}).log?.info?.({
                        $meta: {mtid: 'event', method: 'kustomize.reconcile.run'},
                        message:
                            `reconcile: ${group.resourceType} wants ` +
                            `${resourceKey(diff.create[0].object)} but the cluster has ` +
                            `${resourceKey(diff.obsolete[0])} [keys ${Object.keys(
                                diff.obsolete[0],
                            ).join(',')} apiVersion ${String(diff.obsolete[0].apiVersion)}]`,
                    });
                }
                if (readOnly) continue;

                for (const entry of [...diff.create, ...toApply]) {
                    const apply = call(wireName(group.resourceType, 'Apply'));
                    if (!apply) {
                        failures.push({key: resourceKey(entry.object), message: 'no apply verb'});
                        continue;
                    }
                    try {
                        await apply(applyParams(entry), meta);
                    } catch (error) {
                        failures.push({key: resourceKey(entry.object), message: message(error)});
                    }
                }

                // A Job is a step, not a process: the seed fills the volume and the migration
                // brings the schema up to date, and everything APPLY_ORDER puts after them reads
                // what they wrote. So the loop waits here rather than rolling a process against a
                // volume or a schema that is not ready yet — and the unchanged ones are waited on
                // too, because a Job that failed in an earlier pass is still a step not taken.
                if (group.resourceType === 'job') {
                    const findStep = call(wireName(group.resourceType, 'Find'));
                    for (const entry of [...diff.create, ...diff.update, ...diff.unchanged]) {
                        const failure = await waitForStep(entry.object, findStep, meta);
                        if (!failure) continue;
                        failures.push({key: resourceKey(entry.object), message: failure});
                        // The failed Job is **left where it is** (@@D-386, Q6). It used to be removed so
                        // that the next pass could create the same object again — a Job's spec is
                        // immutable — but the name now carries the attempt (version and hash), so a
                        // retry is a different object and nothing has to be deleted for it to exist.
                        // What is kept instead is the evidence: the Job that failed, its events and
                        // its logs, which a pass that deleted it while reporting the failure took
                        // away from whoever reads the report.
                    }
                }

                if (!params.prune) continue;
                // A Job is not pruned by obsolescence the way the other kinds are: an older attempt is
                // obsolete the moment a new one is generated, and it is exactly what a failed deploy is
                // read from. So the retirement of Job attempts is a decision of its own — the newest
                // few stay, failures included — and it is taken here, where the deletion is, from the
                // retention the objects carry themselves.
                const pastRetention =
                    group.resourceType === 'job'
                        ? jobsPastRetention(diff.obsolete)
                        : prunableByObsolescence(diff.obsolete);
                for (const object of prunable(pastRetention, suiteNamespace)) {
                    const remove = call(wireName(group.resourceType, 'Remove'));
                    if (!remove) {
                        failures.push({key: resourceKey(object), message: 'no delete verb'});
                        continue;
                    }
                    try {
                        await remove(
                            {name: object.metadata?.name, namespace: object.metadata?.namespace},
                            meta,
                        );
                        deleted += 1;
                    } catch (error) {
                        failures.push({key: resourceKey(object), message: message(error)});
                    }
                }
            }

            // The install tree piles up the same way the tenant's namespace does, and nothing swept
            // it (@@D-491): an operator image is an identity, so every rollout leaves another fill Job
            // per node in the namespace the operator is installed in — 28 Jobs across 14 identities
            // were sitting there against a retention of three. Swept here, by the same rule and with
            // the same cascade, and only over Jobs that name a retention label themselves, so the
            // install-owned RBAC, Deployment and Service beside them stay out of reach (@@D-461).
            //
            // Only a pass triggered by a CR does this, because that pass is the operator and the
            // namespace is the operator's own. A tenant's pass runs this same code and would be
            // refused there — a failure per pass, over objects it has no business reading.
            if (params.prune && !readOnly && origin === 'cr') {
                const findJob = call(wireName('job', 'Find'));
                const removeJob = call(wireName('job', 'Remove'));
                if (findJob && removeJob) {
                    try {
                        const found = (await findJob({namespace: OPERATOR_NAMESPACE}, meta)) as {
                            items?: IClusterObject[];
                        };
                        const retired = jobsPastRetention(
                            (found.items ?? []).filter(hasRetentionLabel),
                        );
                        for (const object of retired) {
                            await removeJob(
                                {
                                    name: object.metadata?.name,
                                    namespace: object.metadata?.namespace,
                                },
                                meta,
                            );
                            deleted += 1;
                        }
                    } catch (error) {
                        failures.push({
                            key: `${OPERATOR_NAMESPACE}/job`,
                            message: message(error),
                        });
                    }
                }
            }

            const reason = readOnly
                ? 'read-only pass; set apply to deploy'
                : failures.length
                  ? 'some steps failed and are reported; the rest were applied'
                  : undefined;
            // A pass reports its own outcome, not only the controller that triggered it: a watch
            // triggers a pass directly, and a pass with no line of its own is indistinguishable from
            // one that never ran (the shape @@T-225 hid behind for three days).
            (this as unknown as {log?: {info?: (entry: object) => void}}).log?.info?.({
                $meta: {mtid: 'event', method: 'kustomize.reconcile.run'},
                message:
                    `reconcile: pass from ${origin}, apply ${readOnly ? 'no' : 'yes'}: ` +
                    `${created} to create, ${updated} to update, ${unchanged} unchanged, ` +
                    `${obsolete} obsolete, ${deleted} deleted` +
                    `${tally.length ? ` (${tally.join(', ')})` : ''}` +
                    `${failures.length ? `, ${failures.length} failed` : ''}`,
            });

            // The status is what a reader sees without reading logs: a phase, the version this pass
            // applied, and the counts behind both. Written only by a pass that could have changed the
            // cluster — a read-only pass reports in its log and claims nothing about the CR — and the
            // write never fails the pass it describes, because the work is already done.
            if (params.apply === true && origin === 'cr' && declaredName) {
                const wantedDeployments = managed.filter(entry => entry.kind === 'Deployment');
                const deployments = await deploymentAvailability(
                    wantedDeployments,
                    suiteNamespace,
                    meta,
                );
                const available = deployments.filter(entry => entry.available > 0).length;
                const phase: StatusPhase = failures.length
                    ? 'Failed'
                    : available === deployments.length
                      ? 'Ready'
                      : 'Progressing';
                const waiting = deployments
                    .filter(entry => entry.available === 0)
                    .map(entry => entry.name);
                const edit = call('kustomizeStatusEdit');
                await edit?.(
                    {
                        name: declaredName,
                        namespace: suiteNamespace,
                        phase,
                        observedVersion: declared?.version,
                        message: failures.length
                            ? `${failures.length} step(s) failed, first: ${failures[0].key}`
                            : waiting.length
                              ? `applied; waiting for ${waiting.join(', ')}`
                              : `${created} created, ${updated} updated, ${unchanged} unchanged`,
                        deployments,
                        lastResult: {
                            at: new Date().toISOString(),
                            created,
                            updated,
                            unchanged,
                            obsolete,
                            deleted,
                            failures: failures.length,
                        },
                    },
                    meta,
                );
            }
            return {
                reconciled: groups.reduce((total, group) => total + group.live.length, 0),
                applied: !readOnly && failures.length === 0,
                origin,
                // Which declaration this pass answered for. A caller that named the CR knows it
                // already; the one that named none was answered about whichever the cluster holds,
                // and a pass that does not say which is one nobody can act on .
                ...(origin === 'cr' && declaredName
                    ? {suite: {name: declaredName, namespace: suiteNamespace}}
                    : {}),
                created,
                updated,
                unchanged,
                obsolete,
                deleted,
                skipped: skipped.map(entry => `${entry.path}: ${entry.reason}`),
                // Whether this pass had to make the keys, so a run that created a suite's first pair
                // says so rather than leaving the reader to diff secrets .
                ...(keys ? {keys} : {}),
                ...(failures.length ? {failures} : {}),
                ...(reason ? {reason} : {}),
            };
        },
    };
});
