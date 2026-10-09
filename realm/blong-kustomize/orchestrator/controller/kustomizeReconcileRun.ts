import {handler, type IMeta} from '@feasibleone/blong';
import {
    INSTANCE_LABEL,
    PART_OF_LABEL,
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
    OPERATOR_PLURAL,
    OPERATOR_VERSION,
    type StatusPhase,
} from '../../operator.ts';
import type {IBlongDeploymentSpec, IDescribeCapable, IPlanConfig} from '../../plan.ts';
import {
    DEFAULT_ATTEMPT_RETENTION,
    planFromRegistry,
    planOptionsFromSpec,
    planOptionsOf,
    registryView,
} from '../../plan.ts';

type ClusterCall = (params: unknown, $meta: IMeta) => Promise<unknown>;

const message = (error: unknown): string =>
    error instanceof Error ? error.message : String(error);

/**
 * Which of a deploy's older Job attempts a prune may remove (D-386, Q6).
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

/**
 * Which of the objects a plan no longer mentions a pass may remove.
 *
 * Only the suite's own namespace (D-461). What makes deletion safe is that the pass lists nothing
 * but what the suite owns, and ownership is not the only question a removal asks: the generated
 * third-party services live in a namespace of their own precisely so that a config edit cannot take
 * a shared database with it. So the alias goes — it sits in the suite's namespace, which is where a
 * realm's config dials it — and the workload, claim and Service beside it stay until whoever owns
 * that namespace retires them, reported as obsolete either way.
 *
 * The listing is scoped to that namespace already, so this filter is the second lock on the same
 * door: the first is the namespace every lookup is made in, and the second says out loud what the
 * decision is, so a listing that ever widens cannot delete past it.
 *
 * Cluster-scoped objects fall out with the same rule, which is what the install's own policy asks
 * for: the rights the operator runs under are not the operator's to withdraw.
 */
export const prunable = (obsolete: IClusterObject[], namespace: string): IClusterObject[] =>
    obsolete.filter(object => object.metadata?.namespace === namespace);

/** The labels a retention step reads, and therefore the objects obsolescence leaves alone. */
const RETENTION_LABELS = ['blong.feasible.one/retention', 'blong.feasible.one/attempt-retention'];

/**
 * The obsolete objects a pass may remove by obsolescence on its own.
 *
 * Everything except the objects a retention step retires. An object carrying either retention label is
 * counted by whoever reads that number — how many volume directories to keep, how many Job attempts —
 * and a tree names one identity at a time, which makes every other identity look obsolete to a pass
 * that diffed without reading the label. So the volumes a suite is not currently running, and the
 * attempts a previous deploy left, are left to their own steps, and only the objects nothing else
 * decides are removed here (T-282, D-464, D-471).
 */
export const prunableByObsolescence = (obsolete: IClusterObject[]): IClusterObject[] =>
    obsolete.filter(object =>
        RETENTION_LABELS.every(label => object.metadata?.labels?.[label] === undefined),
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
 * CR as a failed deploy (F-406). A changed attempt is a different name, and arrives as a create.
 */
export const appliesUpdate = (resourceType: string): boolean => resourceType !== 'job';

/**
 * The retention the objects declare about themselves.
 *
 * Read off a Job rather than taken from the plan, because a CR-driven pass never sees the plan its
 * tree was generated from — it applies what a child wrote — while every object the generator emits
 * carries `blong.feasible.one/retention` for exactly this kind of reader.
 */
export const retentionOf = (objects: IClusterObject[], fallback = 3): number => {
    const declared = objects
        .map(object => Number(object.metadata?.labels?.['blong.feasible.one/retention']))
        .find(value => Number.isFinite(value) && value >= 1);
    return declared ?? fallback;
};

/**
 * The attempt retention the objects declare about themselves.
 *
 * A second reader for a second number (D-471): the Jobs carry how many attempts to keep and the volumes
 * carry how many directories, and one knob for both is how a suite that kept three volumes kept three
 * attempts. Read off the objects for the same reason the volumes' is: a CR-driven pass never sees the
 * plan its tree was generated from.
 */
export const attemptRetentionOf = (
    objects: IClusterObject[],
    fallback = DEFAULT_ATTEMPT_RETENTION,
): number => {
    const declared = objects
        .map(object => Number(object.metadata?.labels?.['blong.feasible.one/attempt-retention']))
        .find(value => Number.isFinite(value) && value >= 1);
    return declared ?? fallback;
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
 * word matches no API (F-379). The framework's own k8s tests call single-word resources the same
 * way (`clusterPodFind`, `clusterPodLog`), so the realm can apply a kind without importing a
 * Kubernetes client of its own.
 */
const wireName = (resourceType: string, verb: string): string =>
    `cluster${resourceType
        .split('_')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join('_')}${verb}`;

/**
 * kustomize.reconcile.run — one pass of the operator's loop.
 *
 * The plan is derived again here, from the registry this process loaded, and the tree it
 * builds is compared against the cluster: what is missing is created, what differs is
 * updated, what matches is left alone. Deriving rather than reading the written tree
 * keeps the operator honest about its own state — the files on disk are an artefact for
 * review, not the source of truth.
 *
 * Two words guard the destructive half. Without `apply` this is a read: it lists the
 * kinds the plan mentions and reports the difference it would make, which is the half
 * safe to run against a live cluster at any time. Without `prune` on top of `apply`,
 * nothing is deleted, because a converge and a removal are different intentions and the
 * second one cannot be walked back.
 *
 * The adapter is reached through the handler proxy by name, so this handler holds no
 * reference to it (the IoC rule) and a test can stand in for the cluster.
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
     * (D-395, T-234). Reaching it through the proxy keeps this handler free of a reference to it, the
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
     * summary of it. A failure to list answers zeroes rather than throwing — a status that could
     * not be counted should say so, not take the pass down with it.
     */
    const deploymentAvailability = async (
        names: string[],
        namespace: string,
        meta: IMeta,
    ): Promise<Array<{name: string; available: number}>> => {
        if (!names.length) return [];
        const find = call('clusterDeploymentFind');
        if (!find) return names.map(name => ({name, available: 0}));
        try {
            const found = (await find({namespace}, meta)) as {items?: IClusterObject[]};
            const byName = new Map((found?.items ?? []).map(item => [item.metadata?.name, item]));
            return names.map(name => {
                const status = byName.get(name)?.status as {availableReplicas?: number} | undefined;
                return {name, available: Number(status?.availableReplicas ?? 0)};
            });
        } catch {
            return names.map(name => ({name, available: 0}));
        }
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
     * a bare "did not finish" (T-251).
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
            // (T-210).
            const options = planOptionsOf(self.config);
            let origin: 'registry' | 'cr' = 'registry';
            // Kept out here because the status is written at the end of the pass, back to the CR the
            // pass was triggered by — and only a CR pass has one.
            let declared: IBlongDeploymentSpec | undefined;
            let declaredName: string | undefined;
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
                // knows from the client's own API list.
                const found = (await list(
                    {
                        group: OPERATOR_GROUP,
                        version: OPERATOR_VERSION,
                        plural: OPERATOR_PLURAL,
                        namespace: tenant,
                    },
                    meta,
                )) as {
                    items?: Array<{
                        metadata?: {name?: string};
                        spec?: IBlongDeploymentSpec;
                    }>;
                };
                // Filtered here rather than in the API call: the adapter's find answers a list, and
                // one namespace holds one suite in practice, so a name is a lookup into a handful of
                // items rather than a reason for a second verb. The item is kept whole because the
                // status is written back to the object it was read from.
                const item = found?.items?.find(
                    entry => params.name === undefined || entry.metadata?.name === params.name,
                );
                declared = item?.spec;
                declaredName = item?.metadata?.name;
                if (!declared) {
                    return {
                        reconciled: 0,
                        applied: false,
                        reason: params.name
                            ? `no BlongDeployment ${params.name} in ${tenant}`
                            : `no BlongDeployment names a suite in ${tenant}`,
                    };
                }
                // The CR's namespace is the tenant: the suite deploys where it was declared, not
                // where this process happens to be configured.
                options.namespace = tenant;
                Object.assign(options, planOptionsFromSpec(declared));
                origin = 'cr';
            }
            // A registry pass reconciles the suite *this process is*, so a process that declares no
            // suite entry has no tree of its own to apply: running this realm's CLI against a cluster
            // planned the realm's own ports — `blong`, `codec`, `kustomize` — and deployed them as a
            // suite's workloads into whatever namespace it was handed (F-406), and the failure was
            // silent, because a pass reports what it created. Refused rather than narrowed by
            // namespace: a namespace says where a pass may write, not whether it has a suite to
            // write (T-260).
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
            // process applies what the child wrote (D-395, T-234).
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
                tree = buildKustomizeTree(planFromRegistry(registryView(self.registry), options));
            }
            const {managed, skipped} = collectManifests(tree);

            // A pass says what it was asked to do before it does it. The controller logs what the
            // call answered, which is not the same thing: while the dispatch was broken (T-225) that
            // line reported a pass that had run and changed nothing, and the only way to tell it
            // apart from a pass that never ran was to look here.
            (this as unknown as {log?: {info?: (entry: object) => void}}).log?.info?.({
                $meta: {mtid: 'event', method: 'kustomize.reconcile.run'},
                message:
                    `reconcile: reading from ${origin}, apply ${params.apply === true}, ` +
                    `prune ${params.prune === true}: ${managed.length} managed, ` +
                    `${skipped.length} skipped`,
            });

            // One listing per resource type, selected by ownership: everything the label
            // returns belongs to this suite, which is what lets a live object the plan no
            // longer mentions be treated as obsolete rather than as a stranger.
            const byType = new Map<string, IDesiredResource[]>();
            for (const entry of managed) {
                const list = byType.get(entry.resourceType) ?? [];
                list.push(entry);
                byType.set(entry.resourceType, list);
            }

            const groups: Array<{
                resourceType: string;
                desired: IDesiredResource[];
                live: IClusterObject[];
            }> = [];
            // The tree's kinds *and* the kinds a suite may own, because the interesting case is a
            // kind that left the tree: a pass that looks up only what it names can never see the
            // object it stopped naming (T-282, D-464).
            for (const resourceType of [...byType.keys(), ...sweptResourceTypes()]) {
                if (groups.some(group => group.resourceType === resourceType)) continue;
                const desired = byType.get(resourceType) ?? [];
                const find = call(wireName(resourceType, 'Find'));
                if (!find) {
                    // A kind the tree names and the cluster cannot look up is a pass that would apply
                    // what it cannot reconcile, so it says so. One only the sweep is interested in is
                    // skipped: the adapter does not answer for it either way.
                    if (!desired.length) continue;
                    return {
                        reconciled: 0,
                        applied: false,
                        reason: `the cluster adapter does not answer ${resourceType} lookups`,
                    };
                }
                const found = (await find(
                    {
                        namespace: suiteNamespace,
                        labelSelector: `${PART_OF_LABEL}=${suiteName}`,
                    },
                    meta,
                )) as {items?: IClusterObject[]};
                groups.push({resourceType, desired, live: found?.items ?? []});
            }

            const readOnly = !params.apply;

            /**
             * The suite's keys, before the processes that read them.
             *
             * The tree cannot carry them — a regenerated tree must be byte-identical, which the
             * realm's tests pin — so the deployment creates them, and it has to create them *before*
             * the Deployments: a pod that comes up in this same pass would otherwise hold only the
             * framework's per-process fallback, and the browser session opened against it would
             * belong to that one replica until it restarts (T-252). A read-only pass creates nothing,
             * the same rule pruning follows.
             */
            let keys: {name: string; created: boolean; reason?: string} | undefined;
            if (!readOnly) {
                const ensure = call('kustomizeGatewayKeysEnsure') as unknown as
                    | ((params: {namespace: string}, $meta?: IMeta) => Promise<typeof keys>)
                    | undefined;
                keys = ensure ? await ensure({namespace: suiteNamespace}, meta) : undefined;
            }
            let created = 0;
            let updated = 0;
            let unchanged = 0;
            let obsolete = 0;
            let deleted = 0;
            const failures: Array<{key: string; message: string}> = [];
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
                // names itself on the first run (T-226).
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
                        // The failed Job is **left where it is** (D-386, Q6). It used to be removed so
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
                        ? jobAttemptsPastRetention(diff.obsolete, attemptRetentionOf(diff.obsolete))
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

            const reason = readOnly
                ? 'read-only pass; set apply to deploy'
                : failures.length
                  ? 'some steps failed and are reported; the rest were applied'
                  : undefined;
            // A pass reports its own outcome, not only the controller that triggered it: a watch
            // triggers a pass directly, and a pass with no line of its own is indistinguishable from
            // one that never ran (the shape T-225 hid behind for three days).
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
                const wantedNames = managed
                    .filter(entry => entry.kind === 'Deployment')
                    .map(entry => entry.object.metadata?.name)
                    .filter((entryName): entryName is string => !!entryName);
                const deployments = await deploymentAvailability(wantedNames, suiteNamespace, meta);
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
                created,
                updated,
                unchanged,
                obsolete,
                deleted,
                skipped: skipped.map(entry => `${entry.path}: ${entry.reason}`),
                // Whether this pass had to make the keys, so a run that created a suite's first pair
                // says so rather than leaving the reader to diff secrets (T-252).
                ...(keys ? {keys} : {}),
                ...(failures.length ? {failures} : {}),
                ...(reason ? {reason} : {}),
            };
        },
    };
});
