/**
 * generator.ts — turns a deployment plan into a kustomize tree.
 *
 * Like `plan.ts` this module sits at the realm root, outside every layer folder,
 * so the framework never scans it as a handler group. It is pure: given a plan and
 * an output directory it produces a set of YAML documents; nothing here touches
 * the registry or the cluster.
 *
 * The shape follows the legacy UT generator (`ut-run/service/install.js`): one
 * kustomization per folder, a root kustomization that lists the folders, and
 * deterministic output (deep-sorted keys, no line folding) so a regenerated tree
 * is byte-identical and reviewable in git.
 */
import {createHash} from 'node:crypto';
import {
    existsSync,
    mkdirSync,
    readFileSync,
    readdirSync,
    rmSync,
    statSync,
    writeFileSync,
} from 'node:fs';
import {basename, dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parse, stringify} from 'yaml';
import {GENERATED_CREDENTIALS_LABEL, isClusterResource, stampSpecHash} from './apply.ts';
import {
    FILL_ENV,
    FILL_MODULE,
    artifactIdentity,
    fillCommand,
    fillModuleData,
    fillModuleMount,
    fillModuleVolume,
} from './artifact.ts';
import {
    AUTH_REVIEW_RULES,
    OPERATOR_CLUSTER_RULES,
    OPERATOR_ENV,
    OPERATOR_GROUP,
    OPERATOR_NAME,
    OPERATOR_NAMESPACE,
    OPERATOR_NAMESPACED_RULES,
    OPERATOR_VERSION,
} from './operator.ts';
import type {
    IComponentVolume,
    IDeployment,
    IDeploymentPlan,
    IExternalService,
    IExternalServiceMap,
    IGeneratorEntry,
    IPortalAuth,
    IService,
    ISuitePortal,
    ISuitePortalMap,
} from './plan.ts';
import {
    DEFAULT_ATTEMPT_RETENTION,
    DEFAULT_PROFILE,
    DEFAULT_RESOURCES,
    DEFAULT_RETENTION,
} from './plan.ts';
import {DEFAULT_SERVICES_NAMESPACE, type IBackingService} from './services.ts';

const KUSTOMIZE_API = 'kustomize.config.k8s.io/v1beta1';

/** Where the tree is written when the realm config names no directory. */
export const DEFAULT_OUTPUT_DIR = 'system/kustomize';

/** A single manifest, or raw file content. */
export type KustomizeResource = Record<string, unknown> | string;

/** path (relative to the tree root) → manifest. */
export type KustomizeTree = Map<string, KustomizeResource>;

/**
 * The `resources` block every generated container carries; an empty one would leave it BestEffort
 * (@@F-432).
 */
const containerResources = (): {
    requests: Record<string, string>;
    limits: Record<string, string>;
} => ({
    requests: {...DEFAULT_RESOURCES.requests},
    limits: {...DEFAULT_RESOURCES.limits},
});

const suiteLabels = (plan: IDeploymentPlan): Record<string, string> => ({
    // The standard meanings, and the reason the selectors below moved to `instance`: `name` is the
    // application, which here is the suite, so it cannot also pick out one of its deployments. A
    // label that means both is a label that selects the whole suite the moment a second deployment
    // exists (Phase 15 A).
    'app.kubernetes.io/name': plan.suite.name,
    'app.kubernetes.io/version': suiteVersion(plan),
    'app.kubernetes.io/part-of': plan.suite.name,
    'app.kubernetes.io/managed-by': 'blong-kustomize',
});

/**
 * The labels a base may stamp on every object: the suite's identity, without the version.
 *
 * `app.kubernetes.io/version` answers "which build is deployed", and the declaration answers it rather
 * than the tree that happens to have been generated (@@D-652). It has to leave the transformer and
 * not only the objects: a label transformer runs after the patches, so a version here would overwrite
 * the one every patch puts back.
 */
const baseLabels = (plan: IDeploymentPlan): Record<string, string> => {
    const {['app.kubernetes.io/version']: _version, ...rest} = suiteLabels(plan);
    return rest;
};

/** The `version` of the manifest beside an entry, when there is one to read. */
const manifestVersion = (entry?: string): string | undefined => {
    if (!entry) return undefined;
    try {
        const manifest = JSON.parse(readFileSync(join(dirname(entry), 'package.json'), 'utf8')) as {
            version?: string;
        };
        return manifest.version;
    } catch {
        // No manifest beside that entry, or one that does not parse: the caller decides what to say.
        return undefined;
    }
};

/**
 * The version of the suite the tree deploys: the config's, else the running package's manifest, else
 * the plan's `entry` — never required, so no suite repeats a value its package holds.
 */
const suiteVersion = (plan: IDeploymentPlan): string =>
    plan.suite.version ??
    manifestVersion(fileURLToPath(import.meta.url)) ??
    manifestVersion(plan.suite.entry ?? DEFAULT_SUITE_ENTRY) ??
    'latest';

/**
 * What one deploy's artifact is called: the suite's version and a token taken from the artifact.
 *
 * The volume is named after this and nothing else (@@D-469), which is what makes a rebuilt artifact under
 * an unchanged version a *new* directory rather than a rewrite of the one readers are attached to. The
 * name itself is computed in one place, `artifact.ts`, because the operator's artifact cache asks the
 * same question and has to answer it the same way (@@F-452).
 */
export const volumeIdentity = (plan: IDeploymentPlan): string =>
    artifactIdentity(suiteVersion(plan), plan.suiteVolume.artifact);

const image = (plan: IDeploymentPlan): string =>
    `${plan.suite.frameworkImage}:${plan.suite.minFrameworkVersion ?? 'latest'}`;

/**
 * Where a process reads the suite artifact from.
 *
 * One path for every container that touches the volume, because Rush's deploy link script writes
 * *absolute* links computed from its own working directory: unpack and link at one path and read at
 * another, and every link in the artifact dangles — which is exactly how the first live deployment
 * failed (`blong -> /cache/1/core/blong` while the deployment mounted the same directory at
 * `/opt/deploy/suite`). The image's working directory is `/opt/deploy`, which holds this path.
 */
export const SUITE_MOUNT = '/opt/deploy/suite';

/**
 * Where the artifact directories live on a node: one directory per suite, and inside it one per
 * artifact identity.
 *
 * A node's filesystem rather than a claim, which is what makes the directory the deployer's to create
 * and the retention's to count: `nodeLocal` needs no storage class, and a directory can be renamed into
 * place where a claim cannot.
 */
export const SUITE_ROOT = '/var/lib/blong/suites';

/**
 * Where a suite's declaration sits in a *flat* tree, and what an example is built from.
 *
 * A `BlongDeployment` is the tenant's act: its `metadata.namespace` is the namespace the suite is
 * deployed into, its `spec.services` is what that deployment brings, and the artifact's digest is what
 * it was fetched at. None of that belongs in a base every deployment of the suite shares (@@D-506), so a
 * split writes the declaration **beside** the base — a sample a tenant copies and edits — and only the
 * flat layout keeps it at the tree's root, where it was always a one-off `kubectl apply -f`'s
 * convenience.
 */
export const CR_PATH = 'blongdeployment.yaml';

/** Where a split puts the declaration: an example beside the base rather than an object inside it. */
export const CR_EXAMPLE = 'example/blongdeployment.yaml';

/**
 * The declaration as *this* deployment states it, in the overlay the deployment owns.
 *
 * The example beside the base is committed and read by a tenant, so it cannot name an address
 * @@D-645. The declaration a run applies is the same object with the real values, and it lives in
 * `local/` beside the rest of what one deployment says — applied with `kubectl apply -f` rather than
 * by a kustomization, because it is the tenant's act and not an object the tenant's tree describes.
 */
export const CR_DECLARATION = 'local/declaration/blongdeployment.yaml';

/** The file a template's folder carries: the object an instance's kustomization includes. */
export const TEMPLATE_FILE = 'template.yaml';

/**
 * Where the artifact's entry point sits inside the mounted volume.
 *
 * Absolute, like every entry this file emits: the framework hands the argument to `import()`, which
 * resolves a relative specifier against the framework's own directory rather than the working
 * directory, so the container that names one exits with a module-not-found path inside the image.
 */
const DEFAULT_SUITE_ENTRY = `${SUITE_MOUNT}/index.ts`;

/**
 * The intents a deployed process runs with — `release`, last, because the trailing name picks the rc
 * file the loader reads (@@D-428).
 */
export const DEFAULT_SUITE_INTENTS = ['release'];

/**
 * The intents that describe how a *developer* runs a realm, which a deployment must not carry.
 *
 * They are not refused, they are dropped: a CR written before this distinction existed names
 * `microservice` (the CRD used to default to it), and honouring it would activate every layer of
 * every realm the pod carries — a split deployment turned into N monoliths, each opening the other
 * processes' gateways and database connections (@@D-428). `dev` and `integration` are the same kind of
 * mistake for the same reason: a released process neither watches files nor runs tests.
 */
const DEV_ONLY_INTENTS = new Set(['microservice', 'dev', 'integration', 'playwright']);

/**
 * The command line's intents, whatever a CR named: the deployment-safe ones it asked for, with
 * `release` last so the rc file the tree mounts is the one that gets read.
 */
export const deploymentIntents = (intents: readonly string[] | undefined): string[] => [
    ...(intents ?? DEFAULT_SUITE_INTENTS).filter(
        intent => intent !== 'release' && !DEV_ONLY_INTENTS.has(intent),
    ),
    'release',
];
/** Where the deployment UI answers unless a suite asks for a prefix (Q4: a CRD default). */
export const DEFAULT_UI_PATH = '/';

/**
 * The container command line.
 *
 * The image's entry point is `blong.ts`, which runs whatever entry point it is given and, with
 * none, looks for `index.ts`/`server.ts` in its working directory — `/opt/deploy`, which holds the
 * suite volume as `suite/`. So the artifact's own entry has to be named here: without this the
 * container started, found no entry point and exited (the deployment test that found this is what a
 * live run is for). An entry that resolves to a file in the working directory still has to be
 * written as an absolute path — see `DEFAULT_SUITE_ENTRY`.
 */
const suiteArgs = (plan: IDeploymentPlan): string[] => [
    plan.suite.entry ?? DEFAULT_SUITE_ENTRY,
    ...deploymentIntents(plan.suite.intents),
    ...profileArgs(plan),
];

/**
 * The one command-line setting a *monolith* deployment has to be given, and why it is the tree's
 * business rather than the suite's.
 *
 * A monolith serves every namespace a call can name, so a call to one of them is a call to itself:
 * `canSkipSocket` is what makes the remote proxy resolve the method in-process instead of opening a
 * socket to a Service that, in a monolith, is the caller. A realm or a layer profile is the
 * opposite — a namespace the process does not serve has to go over the network — which is why this
 * is emitted per profile instead of being configured once. A suite that spells it out in its own
 * config carries a sentence about its deployment shape that stays true only until somebody copies
 * the config into a split tree, and there the call that should have crossed the network resolves
 * locally and fails as a method nobody has .
 */
const profileArgs = (plan: IDeploymentPlan): string[] =>
    plan.profile === 'monolith' ? ['--remote.canSkipSocket=true'] : [];

const namespaceResource = (plan: IDeploymentPlan): Record<string, unknown> => ({
    apiVersion: 'v1',
    kind: 'Namespace',
    metadata: {name: plan.suite.namespace, labels: suiteLabels(plan)},
});

/**
 * The two configuration files a cluster may supply, mounted into every pod that runs a suite entry —
 * both `optional`, and neither written here.
 */
export const RELEASE_RC_SECRET = 'blong-releaserc';
export const RELEASE_RC_SITE_SECRET = 'blong-releaserc-etc';
const RELEASE_RC_HOME = '/home/node/.blong_releaserc';
const RELEASE_RC_SITE = '/etc/blong_releaserc';

/**
 * The suite's key material, as an rc Secret the pods read — one pair per suite, not per process
 * (@@D-441).
 */
const gatewayKeys = (plan: IDeploymentPlan): {volumes: unknown[]; mounts: unknown[]} => ({
    volumes: [
        {
            name: 'gateway-keys',
            secret: {
                secretName: GATEWAY_KEYS_SECRET,
                optional: true,
                items: [{key: 'config', path: 'config'}],
            },
        },
    ],
    mounts: [{name: 'gateway-keys', mountPath: rcConfigDir(plan), readOnly: true}],
});

/**
 * Where `rc` looks for the deployment's own file in a pod: the trailing intent names the rc file
 * (@@D-428).
 */
const rcConfigDir = (plan: IDeploymentPlan): string =>
    `/home/node/.config/blong_${deploymentIntents(plan.suite.intents).at(-1) ?? 'release'}/`;

/** The Secret the suite's gateway keys live in: a constant, because a namespace holds one suite. */
export const GATEWAY_KEYS_SECRET = 'gateway-keys';

const releaseRc = (): {volumes: unknown[]; mounts: unknown[]} => ({
    volumes: [
        {
            name: 'releaserc-home',
            secret: {
                secretName: RELEASE_RC_SECRET,
                optional: true,
                items: [{key: '.blong_releaserc', path: '.blong_releaserc'}],
            },
        },
        {
            name: 'releaserc-site',
            secret: {
                secretName: RELEASE_RC_SITE_SECRET,
                optional: true,
                items: [{key: 'blong_releaserc', path: 'blong_releaserc'}],
            },
        },
    ],
    mounts: [
        {
            name: 'releaserc-home',
            mountPath: RELEASE_RC_HOME,
            subPath: '.blong_releaserc',
            readOnly: true,
        },
        {
            name: 'releaserc-site',
            mountPath: RELEASE_RC_SITE,
            subPath: 'blong_releaserc',
            readOnly: true,
        },
    ],
});

/**
 * The artifact volume, and the mount that reaches it.
 *
 * One mount, at one path for every backend and every deploy. What makes that possible is the fill's last
 * step: `create-links.js` writes *absolute* links taken from the directory it runs in, so the artifact is
 * re-written to carry **relative** links instead (@@D-476) — the tree is self-contained, so where it is
 * mounted stops mattering, and a reader sees a tree whose links resolve whatever the identity is (@@F-449,
 * which needed a second mount of the node root before this).
 *
 * The volume is named after the artifact's identity rather than its version, so two artifacts of one
 * version are two directories and neither is ever rewritten under a reader (@@D-468 @@D-469).
 */
const suiteVolume = (
    plan: IDeploymentPlan,
): {volume: Record<string, unknown>; mount: Record<string, unknown>} => {
    const identity = volumeIdentity(plan);
    return plan.suiteVolume.backend === 'shared'
        ? {
              volume: {
                  name: 'suite',
                  persistentVolumeClaim: {
                      claimName: `${plan.suite.name}-${identity}`,
                      readOnly: true,
                  },
              },
              mount: {name: 'suite', mountPath: SUITE_MOUNT, readOnly: true},
          }
        : {
              volume: {
                  name: 'suite',
                  hostPath: {
                      path: `${SUITE_ROOT}/${plan.suite.name}/${identity}`,
                      type: 'Directory',
                  },
              },
              mount: {name: 'suite', mountPath: SUITE_MOUNT, readOnly: true},
          };
};

/**
 * The init container that holds a pod until the artifact in its volume is whole.
 *
 * Superseded by the staged fill: the directory a reader mounts is created by a rename that brings a
 * whole tree with it (@@D-468), so the `Directory` type on the volume is the ordering and this container
 * was only what stood in for it (@@F-448). Kept as a note rather than a comment because the container it
 * describes is gone.
 */

/**
 * The credentials of the services a deployment brings, as environment of the suite's own processes.
 *
 * A service's workload reads the Secret beside itself, but the suite's processes dial the *alias*, so they
 * need the same values — and a pod sees only its own namespace, which is why the tree writes a copy of a
 * generated Secret into the tenant's as well. This is the other half of that copy being useful: `envFrom`
 * puts the Secret's keys into the environment, where `blong-config` reads them, so a deployment that supplies
 * credentials supplies them to the whole suite rather than to the database alone (@@D-509).
 *
 * `optional`, because the reference cannot be conditional: the base is shared by every deployment of the
 * suite, and one that switches the service off must not keep its pods from starting on a Secret that went
 * with it (R5).
 */
const credentialsEnvFrom = (plan: IDeploymentPlan): unknown[] =>
    plan.backingServices
        .filter(service => service.credentialsSecret)
        .map(service => ({secretRef: {name: service.credentialsSecret, optional: true}}));

const deploymentResource = (
    plan: IDeploymentPlan,
    deployment: IDeployment,
): Record<string, unknown> => {
    const {volume, mount} = suiteVolume(plan);
    // The volumes this process owns beyond the suite artifact: a realm that declared one gets it
    // mounted where it asked, and the tree builder emits a claim per volume .
    const extraVolumes = (deployment.volumes ?? []).map(owned => ({
        name: owned.name,
        persistentVolumeClaim: {claimName: owned.name},
    }));
    const extraMounts = (deployment.volumes ?? []).map(owned => ({
        name: owned.name,
        mountPath: owned.mountPath,
    }));
    const selector = {
        'app.kubernetes.io/instance': deployment.name,
        'app.kubernetes.io/part-of': plan.suite.name,
    };
    const credentials = credentialsEnvFrom(plan);
    return {
        apiVersion: 'apps/v1',
        kind: 'Deployment',
        metadata: {
            name: deployment.name,
            namespace: plan.suite.namespace,
            labels: {...suiteLabels(plan), ...selector},
        },
        spec: {
            replicas: deployment.replicas,
            selector: {matchLabels: selector},
            template: {
                metadata: {
                    labels: {
                        ...suiteLabels(plan),
                        ...selector,
                        // One label per namespace this process answers, which is what a namespace
                        // Service selects on (`namespaceServiceResource`): the labels a pod already
                        // has name one process or the whole suite, and neither says which namespaces
                        // it binds.
                        ...Object.fromEntries(
                            deployment.namespaces.map(name => [namespaceLabel(name), 'true']),
                        ),
                    },
                },
                spec: {
                    serviceAccountName: treeServiceAccount(plan),
                    containers: [
                        {
                            name: 'blong',
                            image: image(plan),
                            // The layers this process was planned for, as configuration rather than as
                            // a list in the environment: `--<realm>.<layer>` is the vocabulary layer
                            // activation already speaks, one flag per selector the plan produced.
                            args: [
                                ...suiteArgs(plan),
                                ...deployment.layers.map(layer => `--${layer}`),
                            ],
                            env: [
                                // The config names this process reads configuration by — not the
                                // namespace it lives in. `blong-config` takes the *trailing* name as
                                // the suffix both rc candidates are built from, and this variable
                                // overrides the intents the process was started with, so a value that
                                // disagrees with `args` sends every pod to a file nothing writes:
                                // with the namespace here the release files a deployment mounts were
                                // never read, and the gateway generated a pair per process .
                                // The namespace travels in `BLONG_NAMESPACE` below.
                                {
                                    name: 'BLONG_ENV',
                                    value: deploymentIntents(plan.suite.intents).join(','),
                                },
                                // The Kubernetes resolver names a Service by the namespace it lives
                                // in, and only the cluster can tell a pod which namespace that is:
                                // without this the pod asks for `subject.default.svc.cluster.local`
                                // and dies on ENOTFOUND. Read by `ResolutionK8s`, which falls back to
                                // `default` when it is missing.
                                {
                                    name: 'BLONG_NAMESPACE',
                                    valueFrom: {fieldRef: {fieldPath: 'metadata.namespace'}},
                                },
                                ...(deployment.env ?? []),
                            ],
                            ports: [
                                {name: 'rpc', containerPort: 8091, protocol: 'TCP'},
                                {name: 'http', containerPort: 8080, protocol: 'TCP'},
                                ...(deployment.ports ?? []).map(port => ({
                                    name: port.name,
                                    containerPort: port.containerPort ?? port.port,
                                    protocol: port.protocol ?? 'TCP',
                                })),
                            ],
                            // The credentials of the services this deployment brings, when it supplies any:
                            // the process reads them from the environment the way it reads every other
                            // setting, and the Secret is the copy written into its own namespace (@@D-509).
                            ...(credentials.length ? {envFrom: credentials} : {}),
                            ...(deployment.resources ? {resources: deployment.resources} : {}),
                            volumeMounts: [
                                mount,
                                ...extraMounts,
                                ...releaseRc().mounts,
                                ...gatewayKeys(plan).mounts,
                            ],
                            // TCP, not HTTP: the RPC port is open as soon as the
                            // server listens, while an HTTP probe would depend on a
                            // health route this deployment does not own.
                            livenessProbe: {tcpSocket: {port: 'rpc'}},
                            readinessProbe: {tcpSocket: {port: 'rpc'}},
                        },
                    ],
                    volumes: [
                        volume,
                        ...extraVolumes,
                        ...releaseRc().volumes,
                        ...gatewayKeys(plan).volumes,
                    ],
                },
            },
        },
    };
};

const namespaceServiceResource = (
    plan: IDeploymentPlan,
    namespace: string,
): Record<string, unknown> => ({
    apiVersion: 'v1',
    kind: 'Service',
    metadata: {name: namespace, namespace: plan.suite.namespace, labels: suiteLabels(plan)},
    spec: {
        type: 'ClusterIP',
        // Exactly the processes that bind this namespace, by the label the deployment template
        // carries for it: `app.kubernetes.io/instance` names one process and `app.kubernetes.io/part-of`
        // names every process of the suite, and a namespace answered by some of them needs neither.
        selector: {
            [namespaceLabel(namespace)]: 'true',
            'app.kubernetes.io/part-of': plan.suite.name,
        },
        // One hostname, two spellings: `rpc-<namespace>` is the RPC port a process serves the
        // namespace on, and a bare service id is the gateway port (`ResolutionK8s`). A Service that
        // carried only the first would answer the private half of the contract.
        ports: [
            {name: 'rpc', port: 8091, targetPort: 'rpc', protocol: 'TCP'},
            {name: 'http', port: 8080, targetPort: 'http', protocol: 'TCP'},
        ],
    },
});

/**
 * The label a pod carries for each namespace it answers.
 *
 * A namespace Service has to select the processes that bind the namespace, and the labels a pod
 * already has name one process or the whole suite — so the set that answers a given namespace is not
 * expressible with them. One label per namespace is, and it is also what keeps the Service honest
 * when a companion realm makes several processes answer the same namespace.
 */
const namespaceLabel = (namespace: string): string => `blong.feasible.one/namespace-${namespace}`;

/**
 * The namespaces the plan's processes answer that no existing Service is named after, in plan order.
 *
 * `GatewayCodec` asks for `rpc-<namespace>` and `ResolutionK8s` answers with the Service of the
 * *namespace* name in the suite's namespace, so every namespace a process answers needs one — a
 * realm Service covers those that happen to be named after their realm (`access`, `core`, …), because
 * the subject orchestrator carries them, and nothing published the rest: a process calling `subject`
 * died with `ENOTFOUND rpc-subject` (@@F-413).
 */
const unservedNamespaces = (plan: IDeploymentPlan): string[] => {
    const taken = new Set([
        ...plan.services.map(service => service.name),
        ...plan.externalServices.map(external => external.name),
        ...Object.keys(plan.portal ?? {}).map(gatewayServiceName),
    ]);
    const namespaces: string[] = [];
    for (const deployment of plan.deployments) {
        for (const namespace of deployment.namespaces) {
            if (taken.has(namespace) || namespaces.includes(namespace)) continue;
            namespaces.push(namespace);
        }
    }
    return namespaces;
};

const serviceResource = (plan: IDeploymentPlan, service: IService): Record<string, unknown> => ({
    apiVersion: 'v1',
    kind: 'Service',
    metadata: {name: service.name, namespace: plan.suite.namespace, labels: suiteLabels(plan)},
    spec: {
        type: 'ClusterIP',
        selector: {
            'app.kubernetes.io/instance': service.deployment,
            'app.kubernetes.io/part-of': plan.suite.name,
        },
        // The namespace is served by `RpcServer`, so the Service targets the RPC
        // port — the one `ResolutionK8s` hands back for `rpc-<namespace>`. The gateway port rides
        // beside it for the same reason it does on a namespace Service: the hostname is one and the
        // resolver picks a port by the spelling of the id it was given.
        ports: [
            {name: 'rpc', port: 8091, targetPort: 'rpc', protocol: 'TCP'},
            {name: 'http', port: 8080, targetPort: 'http', protocol: 'TCP'},
        ],
    },
});

/**
 * The indirection that lets a suite refer to a third-party service by an
 * abstract name: an ExternalName Service resolves to whatever the cluster
 * operator points it at, in-cluster or outside.
 */
const externalServiceResource = (
    plan: IDeploymentPlan,
    external: IExternalService,
): Record<string, unknown> => ({
    apiVersion: 'v1',
    kind: 'Service',
    metadata: {
        name: external.name,
        namespace: plan.suite.namespace,
        labels: suiteLabels(plan),
    },
    spec: {
        type: 'ExternalName',
        externalName: external.externalName,
        ...(external.ports ? {ports: external.ports} : {}),
    },
});

/** One path on a host's Ingress: what a caller reaches, and the Service behind it. */
interface IIngressPath {
    path: string;
    pathType: string;
    serviceName: string;
    servicePort: number;
}

/**
 * The name of a host's Ingress: the host itself, as a DNS label.
 *
 * An Ingress is grouped by *host* rather than by deployment (Phase 15 C, Q3: decided). A host is what
 * a certificate and a DNS record belong to, so it is the unit to group by, and a suffix such as
 * `-ui` names the one thing the object is not — the same Ingress carries a webhook or an API path
 * just as happily. `ui.example.test` becomes `ui-example-test`; an Ingress with no host at all is
 * `default`, of which a namespace may have one.
 */
export const ingressName = (host?: string): string => {
    if (!host) return 'default';
    return host
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 63);
};

/**
 * The annotations that put a portal behind the cluster's own authentication.
 *
 * The realm writes annotations rather than a login page: the ingress controller enforces basic auth
 * from a Secret, or delegates to an oauth2 proxy, so the operator authenticates against
 * infrastructure they own.
 *
 * They are the *controller's* annotations, so they belong to the host rather than to the path: two
 * portals sharing a host share one set, and the merge is last-writer-wins per key. That is why a
 * portal that needs a different auth wants a host of its own, and why a webhook sharing the UI's
 * host inherits the UI's authentication .
 */
const authAnnotations = (
    auth: IPortalAuth | undefined,
    realm = 'blong deployment UI',
): Record<string, string> => {
    const annotations: Record<string, string> = {};
    if (auth?.type === 'basic') {
        annotations['nginx.ingress.kubernetes.io/auth-type'] = 'basic';
        annotations['nginx.ingress.kubernetes.io/auth-secret'] = auth.secretName ?? UI_AUTH_SECRET;
        annotations['nginx.ingress.kubernetes.io/auth-realm'] = realm;
    }
    if (auth?.type === 'oauth2' && auth.authUrl) {
        annotations['nginx.ingress.kubernetes.io/auth-url'] = auth.authUrl;
    }
    return annotations;
};

/**
 * One Ingress for one host, carrying every path that host serves.
 *
 * `annotations` are the ingress controller's, so they apply to the whole host: a webhook sharing the
 * UI's host would inherit the UI's authentication, which is why the UI is expected to have a host of
 * its own when a realm contributes a webhook (recorded as a caveat in the plan). The TLS secret is
 * the first one any path on the host named — one certificate per host is what a certificate is.
 */
const hostIngressResource = (
    plan: IDeploymentPlan,
    host: string | undefined,
    paths: IIngressPath[],
    annotations?: Record<string, string>,
    tls?: {secretName?: string},
): Record<string, unknown> => ({
    apiVersion: 'networking.k8s.io/v1',
    kind: 'Ingress',
    metadata: {
        name: ingressName(host),
        namespace: plan.suite.namespace,
        labels: suiteLabels(plan),
        ...(annotations && Object.keys(annotations).length ? {annotations} : {}),
    },
    spec: {
        ...(tls?.secretName
            ? {tls: [{...(host ? {hosts: [host]} : {}), secretName: tls.secretName}]}
            : {}),
        rules: [
            {
                ...(host ? {host} : {}),
                http: {
                    paths: paths.map(entry => ({
                        path: entry.path,
                        pathType: entry.pathType,
                        backend: {
                            service: {name: entry.serviceName, port: {number: entry.servicePort}},
                        },
                    })),
                },
            },
        ],
    },
});

/**
 * The request form of the external services: what the CR carries.
 *
 * The resolved plan has them as a list, because a generator iterates one; the declaration is a map,
 * and the CR is a declaration. The name moves from the entry to the key, which is the only way the
 * two shapes can say the same thing without saying it twice.
 */
const externalServiceRequests = (plan: IDeploymentPlan): IExternalServiceMap =>
    Object.fromEntries(plan.externalServices.map(({name, ...service}) => [name, service]));

/**
 * The request form of the portals: what the CR carries.
 *
 * The process behind a portal is left out on purpose. It follows from the registry the reconciling
 * operator loads, so writing it into the CR would freeze a decision the operator has to make for
 * itself — and the CRD declares no such field, so the API server would prune it on the way in.
 */
const portalRequests = (plan: IDeploymentPlan): ISuitePortalMap =>
    Object.fromEntries(
        Object.entries(plan.portal).map(([name, entry]) => {
            const {deployment: _, ...request} = entry;
            return [name, request];
        }),
    );

/**
 * The gateway Service a portal's Ingress points at: the portal's own name, on port 8080.
 *
 * The alias is the name because it is the one a person chose: it survives a profile change, which a
 * deployment name does not, and a portal is what a reader is looking for — the process behind it is
 * where it leads. One Service per portal, so two portals fronting one process publish two names for
 * it rather than one name that two objects claim; the namespace already separates one suite from
 * another, which is why the suite name is not here either (Phase 15 A2).
 */
export const gatewayServiceName = (portal: string): string => `${portal}-http`;

const httpServiceResource = (
    plan: IDeploymentPlan,
    portal: string,
    entry: ISuitePortal,
): Record<string, unknown> => ({
    apiVersion: 'v1',
    kind: 'Service',
    metadata: {
        name: gatewayServiceName(portal),
        namespace: plan.suite.namespace,
        labels: suiteLabels(plan),
    },
    spec: {
        type: 'ClusterIP',
        selector: {
            'app.kubernetes.io/instance': entry.deployment,
            'app.kubernetes.io/part-of': plan.suite.name,
        },
        ports: [{name: 'http', port: 8080, targetPort: 'http', protocol: 'TCP'}],
    },
});

/**
 * The UI Ingress, with the auth the cluster already understands.
 *
 * The realm writes annotations rather than a login page: the ingress controller
 * enforces basic auth from a Secret, or delegates to an oauth2 proxy, so the
 * operator authenticates against infrastructure they own. Fail-closed is a
 * property of the choice, not of this code — a UI exposed with no `auth` is a
 * deliberate, visible decision in the suite config.
 */
/** A raw manifest a component contributed, keyed by kind and name. */
const manifestPath = (manifest: Record<string, unknown>): string => {
    const kind = typeof manifest.kind === 'string' ? manifest.kind.toLowerCase() : 'manifest';
    const metadata = manifest.metadata as {name?: unknown} | undefined;
    const name = typeof metadata?.name === 'string' ? metadata.name : 'extra';
    return `manifests/${kind}-${name}.yaml`;
};

/**
 * The names a suite tree repeats unchanged (Phase 15 A2).
 *
 * A name varies only where two instances must coexist. Two suites share a cluster, so everything
 * cluster-scoped carries the suite name — the `ClusterRoleBinding` for the auth reviews, the CR
 * itself — while everything inside the suite's own namespace is a constant, because that namespace
 * already separates it from the other suites. A constant is also what makes an upgrade a patch
 * rather than an add-then-delete: a binding names a role that is spelled the same before and after.
 */
export const SUITE_SERVICE_ACCOUNT = 'blong';
const JOBS_ROLE = 'jobs';
/** The Secret name the UI's basic authentication points at unless a suite names its own. */
const UI_AUTH_SECRET = 'ui-auth';

/**
 * The identity a tree's pods run as: the operator's own when the tree is the operator's install,
 * the suite's otherwise. Both are constants, and both are declared by the tree that uses them.
 */
const treeServiceAccount = (plan: IDeploymentPlan): string =>
    plan.install ? OPERATOR_NAME : SUITE_SERVICE_ACCOUNT;

const serviceAccountResource = (plan: IDeploymentPlan): Record<string, unknown> => ({
    apiVersion: 'v1',
    kind: 'ServiceAccount',
    metadata: {
        name: SUITE_SERVICE_ACCOUNT,
        namespace: plan.suite.namespace,
        labels: suiteLabels(plan),
    },
});

const roleResource = (plan: IDeploymentPlan): Record<string, unknown> => ({
    apiVersion: 'rbac.authorization.k8s.io/v1',
    kind: 'Role',
    metadata: {
        name: JOBS_ROLE,
        namespace: plan.suite.namespace,
        labels: suiteLabels(plan),
    },
    rules: [
        {
            apiGroups: ['batch'],
            resources: ['jobs', 'cronjobs'],
            verbs: ['get', 'list', 'watch'],
        },
        // What the deployment UI reads, and nothing more: read-only, and only the
        // kinds the realm asks the cluster about.
        {
            apiGroups: ['', 'apps', 'networking.k8s.io'],
            resources: [
                'pods',
                'services',
                'endpoints',
                'deployments',
                'daemonsets',
                'replicasets',
                'ingresses',
            ],
            verbs: ['get', 'list', 'watch'],
        },
    ],
});

const roleBindingResource = (plan: IDeploymentPlan): Record<string, unknown> => ({
    apiVersion: 'rbac.authorization.k8s.io/v1',
    kind: 'RoleBinding',
    metadata: {
        name: JOBS_ROLE,
        namespace: plan.suite.namespace,
        labels: suiteLabels(plan),
    },
    roleRef: {
        apiGroup: 'rbac.authorization.k8s.io',
        kind: 'Role',
        name: JOBS_ROLE,
    },
    subjects: [
        {kind: 'ServiceAccount', name: SUITE_SERVICE_ACCOUNT, namespace: plan.suite.namespace},
    ],
});

/**
 * The UI's right to ask the cluster a question about a caller: a `TokenReview` and a
 * `SubjectAccessReview`, cluster-scoped (@@D-376).
 */
export const AUTH_REVIEW_ROLE = 'auth-review';
const authReviewClusterRoleResource = (plan: IDeploymentPlan): Record<string, unknown> => ({
    apiVersion: 'rbac.authorization.k8s.io/v1',
    kind: 'ClusterRole',
    metadata: {name: AUTH_REVIEW_ROLE, labels: suiteLabels(plan)},
    // The rules themselves live with the operator's, which needs the same two: the permission is one
    // fact, and two copies of it is how one of them goes stale (see `AUTH_REVIEW_RULES`).
    rules: AUTH_REVIEW_RULES,
});

const authReviewClusterRoleBindingResource = (plan: IDeploymentPlan): Record<string, unknown> => ({
    apiVersion: 'rbac.authorization.k8s.io/v1',
    kind: 'ClusterRoleBinding',
    metadata: {name: `${plan.suite.name}-auth-review`, labels: suiteLabels(plan)},
    roleRef: {
        apiGroup: 'rbac.authorization.k8s.io',
        kind: 'ClusterRole',
        name: AUTH_REVIEW_ROLE,
    },
    // The UI's own identity: the process that serves the portal and asks the reviews.
    subjects: [
        {kind: 'ServiceAccount', name: SUITE_SERVICE_ACCOUNT, namespace: plan.suite.namespace},
    ],
});

/**
 * The operator's identity and permissions (@@D-373).
 *
 * Its own ServiceAccount, Role, RoleBinding and — for the custom resource, which lives
 * outside the namespace — ClusterRole and ClusterRoleBinding. The `rbac/` objects above
 * stay read-only and stay the UI's: the read path and the converge path are different
 * trust levels, and only one of them is reachable from a browser.
 */
const operatorServiceAccountResource = (plan: IDeploymentPlan): Record<string, unknown> => ({
    apiVersion: 'v1',
    kind: 'ServiceAccount',
    metadata: {
        name: OPERATOR_NAME,
        namespace: OPERATOR_NAMESPACE,
        labels: suiteLabels(plan),
    },
});

/**
 * The namespaces a reconcile pass touches: the suite's own, and every namespace the suite's
 * workloads are generated into.
 *
 * The tree holds objects in both — a generated workload runs beside its backing service, and a
 * service sits in a namespace of its own by default (`blong-services`) — and a pass discovers what
 * the suite owns by its labels, so it *reads* objects there whether or not the active profile still
 * generates them. Rights limited to the suite's namespace therefore fail on the read rather than on
 * the apply: the pass reported five failures and never converged. The requested namespace joins the
 * list because a profile that leaves a service to an installation of its own still leaves that
 * service's objects behind for the pass to find.
 */
const tenantNamespaces = (plan: IDeploymentPlan): string[] => [
    ...new Set([
        plan.suite.namespace,
        ...plan.backingServices.map(backingService => backingService.namespace),
        ...(plan.backingServiceRequest.servicesNamespace
            ? [plan.backingServiceRequest.servicesNamespace]
            : []),
    ]),
];

/**
 * What the operator may do inside a tenant: the kinds the tree holds, and nothing cluster-scoped.
 *
 * A `Role` rather than a `ClusterRole`, bound in the tenant's own namespaces: the operator applies a
 * suite where that suite was declared, so its rights are per tenant and granted by the tenant's own
 * tree (@@D-396). The pair ships with the suite because the suite is what knows its namespaces.
 */
const operatorTenantRoleResource = (
    plan: IDeploymentPlan,
    namespace: string,
): Record<string, unknown> => ({
    apiVersion: 'rbac.authorization.k8s.io/v1',
    kind: 'Role',
    metadata: {
        name: OPERATOR_NAME,
        namespace,
        labels: suiteLabels(plan),
    },
    rules: OPERATOR_NAMESPACED_RULES,
});

const operatorTenantRoleBindingResource = (
    plan: IDeploymentPlan,
    namespace: string,
): Record<string, unknown> => ({
    apiVersion: 'rbac.authorization.k8s.io/v1',
    kind: 'RoleBinding',
    metadata: {
        name: OPERATOR_NAME,
        namespace,
        labels: suiteLabels(plan),
    },
    roleRef: {apiGroup: 'rbac.authorization.k8s.io', kind: 'Role', name: OPERATOR_NAME},
    subjects: [{kind: 'ServiceAccount', name: OPERATOR_NAME, namespace: OPERATOR_NAMESPACE}],
});

/** The operator's own namespace, so an install tree reads as one unit. */
const operatorNamespaceResource = (plan: IDeploymentPlan): Record<string, unknown> => ({
    apiVersion: 'v1',
    kind: 'Namespace',
    metadata: {name: OPERATOR_NAMESPACE, labels: suiteLabels(plan)},
});

/** Where the operator caches the artifacts it plans from (@@D-398): one claim, mounted at `/cache`. */
const OPERATOR_CACHE_MOUNT = '/cache';
/** The claim the operator's artifact cache sits on. Distinct from the install's fill Jobs, which
 * carry the *realm's* artifact and are named after the operator too. */
const OPERATOR_CACHE_CLAIM = `${OPERATOR_NAME}-artifacts`;

const operatorCacheClaimResource = (plan: IDeploymentPlan): Record<string, unknown> => ({
    apiVersion: 'v1',
    kind: 'PersistentVolumeClaim',
    metadata: {
        name: OPERATOR_CACHE_CLAIM,
        namespace: OPERATOR_NAMESPACE,
        labels: suiteLabels(plan),
    },
    spec: {
        accessModes: ['ReadWriteOnce'],
        resources: {requests: {storage: '2Gi'}},
    },
});

const operatorRoleResource = (plan: IDeploymentPlan): Record<string, unknown> => ({
    apiVersion: 'rbac.authorization.k8s.io/v1',
    kind: 'Role',
    metadata: {
        name: OPERATOR_NAME,
        namespace: OPERATOR_NAMESPACE,
        labels: suiteLabels(plan),
    },
    rules: OPERATOR_NAMESPACED_RULES,
});

const operatorRoleBindingResource = (plan: IDeploymentPlan): Record<string, unknown> => ({
    apiVersion: 'rbac.authorization.k8s.io/v1',
    kind: 'RoleBinding',
    metadata: {
        name: OPERATOR_NAME,
        namespace: OPERATOR_NAMESPACE,
        labels: suiteLabels(plan),
    },
    roleRef: {
        apiGroup: 'rbac.authorization.k8s.io',
        kind: 'Role',
        name: OPERATOR_NAME,
    },
    subjects: [{kind: 'ServiceAccount', name: OPERATOR_NAME, namespace: OPERATOR_NAMESPACE}],
});

/** Cluster-scoped, so no namespace: the CR and its status are the only names it grants. */
const operatorClusterRoleResource = (plan: IDeploymentPlan): Record<string, unknown> => ({
    apiVersion: 'rbac.authorization.k8s.io/v1',
    kind: 'ClusterRole',
    metadata: {name: OPERATOR_NAME, labels: suiteLabels(plan)},
    rules: OPERATOR_CLUSTER_RULES,
});

const operatorClusterRoleBindingResource = (plan: IDeploymentPlan): Record<string, unknown> => ({
    apiVersion: 'rbac.authorization.k8s.io/v1',
    kind: 'ClusterRoleBinding',
    metadata: {name: OPERATOR_NAME, labels: suiteLabels(plan)},
    roleRef: {
        apiGroup: 'rbac.authorization.k8s.io',
        kind: 'ClusterRole',
        name: OPERATOR_NAME,
    },
    subjects: [{kind: 'ServiceAccount', name: OPERATOR_NAME, namespace: OPERATOR_NAMESPACE}],
});

/**
 * The operator's process: the suite artifact, the write identity, and no ports.
 *
 * It serves nothing, so it declares no ports and no probes — a probe would report a
 * healthy pod for a loop that is not running. It mounts the same read-only suite volume
 * the deployments do, because the plan it reconciles is derived from the registry that
 * artifact carries. Emitted only when the suite asks for it: until the reconcile loop
 * lands  an enabled Deployment starts a process with nothing to do.
 */
const operatorDeploymentResource = (plan: IDeploymentPlan): Record<string, unknown> => {
    const name = OPERATOR_NAME;
    const {volume, mount} = suiteVolume(plan);
    const selector = {
        'app.kubernetes.io/instance': name,
        'app.kubernetes.io/part-of': name,
    };
    return {
        apiVersion: 'apps/v1',
        kind: 'Deployment',
        metadata: {
            name,
            namespace: OPERATOR_NAMESPACE,
            labels: {...suiteLabels(plan), ...selector},
        },
        spec: {
            replicas: plan.operator.replicas,
            selector: {matchLabels: selector},
            template: {
                metadata: {
                    labels: {
                        ...suiteLabels(plan),
                        ...selector,
                    },
                },
                spec: {
                    serviceAccountName: name,
                    containers: [
                        {
                            name: 'operator',
                            image: plan.operator.image ?? image(plan),
                            // The operator's own entry, not a suite's: this process reconciles
                            // suites it does not hold (@@D-395), so what it runs is the deployment
                            // realm and nothing else.
                            args: suiteArgs(plan),
                            env: [
                                // The same rule a suite container follows: the value names the config
                                // this process reads its rc files by, so it agrees with the intents
                                // in `suiteArgs` rather than naming the namespace it lives in.
                                {
                                    name: 'BLONG_ENV',
                                    value: deploymentIntents(plan.suite.intents).join(','),
                                },
                                // The operator calls the suites it serves through the Services their
                                // trees generate, so it knows its own namespace for the same reason a
                                // served container does.
                                {
                                    name: 'BLONG_NAMESPACE',
                                    valueFrom: {fieldRef: {fieldPath: 'metadata.namespace'}},
                                },
                                // The container's command line belongs to the image, so the loop is
                                // switched on here — and the realm reads these same names, which is
                                // what keeps the manifest and the code that obeys it together
                                // .
                                {
                                    name: OPERATOR_ENV.intervalSeconds,
                                    value: `${plan.operator.intervalSeconds}`,
                                },
                                {name: OPERATOR_ENV.from, value: 'cr'},
                                {name: OPERATOR_ENV.apply, value: 'true'},
                                // A deployment that has been told what it should be is a
                                // deployment somebody expects to match it, and what a pass removes is
                                // scoped to the suite's namespace (@@D-461): an object here that the
                                // declaration stopped naming is one nothing brings back, and leaving
                                // it running is how a switched-off service keeps answering.
                                {name: OPERATOR_ENV.prune, value: 'true'},
                                // The API server's certificate is the cluster's own, and this
                                // process must trust it to verify the caller against the issuer
                                // that certificate belongs to: the framework reads the issuer's
                                // discovery document and key set over HTTPS, and without this
                                // that read fails as `SELF_SIGNED_CERT_IN_CHAIN` — which the
                                // deployment page reported as an empty table, because the model's
                                // schema call is what the verification refused. Node appends this
                                // file to its root certificates at startup, so every TLS client
                                // in the process inherits the trust, the gateway codec included.
                                {
                                    name: 'NODE_EXTRA_CA_CERTS',
                                    value: '/var/run/secrets/kubernetes.io/serviceaccount/ca.crt',
                                },
                                // The release trigger's shared secret. Optional, because the Secret
                                // is the installer's to create and an operator that starts before
                                // it must refuse a release (`tokenMissing`) rather than wait in
                                // `CreateContainerConfigError`; the handler is what closes the gate.
                                {
                                    name: 'BLONG_RELEASE_TOKEN',
                                    valueFrom: {
                                        secretKeyRef: {
                                            name: 'blong-operator-release',
                                            key: 'token',
                                            optional: true,
                                        },
                                    },
                                },
                            ],
                            volumeMounts: [
                                mount,
                                {name: 'cache', mountPath: OPERATOR_CACHE_MOUNT},
                                ...releaseRc().mounts,
                                ...gatewayKeys(plan).mounts,
                            ],
                            // Two surfaces, and the Service names both: the rpc port carries the
                            // internal dispatch a peer uses, and the gateway port carries the read
                            // API the deployment UI calls. The entry declares the `gateway` config
                            // that starts the second one — without it the operator listened on 8091
                            // alone and every read route answered 404 .
                            ports: [
                                {name: 'rpc', containerPort: 8091, protocol: 'TCP'},
                                {name: 'http', containerPort: 8080, protocol: 'TCP'},
                            ],
                            // Sized like the processes it deploys rather than left BestEffort.
                            resources: containerResources(),
                        },
                    ],
                    volumes: [
                        volume,
                        {
                            name: 'cache',
                            persistentVolumeClaim: {claimName: OPERATOR_CACHE_CLAIM},
                        },
                        ...releaseRc().volumes,
                        ...gatewayKeys(plan).volumes,
                    ],
                },
            },
        },
    };
};

/**
 * The operator's install tree: what a cluster is given once, before any suite.
 *
 * One operator per cluster and no suite code in it (@@D-396 @@D-397): the namespace it lives in, the
 * claim its artifact cache sits on, the Deployment that runs it, the cluster-scoped rights to the CR
 * and its status, and the CRD — which is cluster-scoped and therefore cannot be shipped by every
 * suite without two suites racing to define it. A suite's tree carries the CR, and the bindings it
 * grants the operator in its own namespace (see the suite branch of `buildKustomizeTree`).
 */
/**
 * The operator's Service: the address the deployment read API answers at.
 *
 * Its selector is the operator's own — `instance` and `part-of` both naming the operator — so a
 * second operator in another namespace is not selected by it. It publishes the same two ports a
 * served container declares: `rpc` (8091) for the internal dispatch, and `http` (8080) for the
 * gateway the read API answers on .
 */
const operatorServiceResource = (plan: IDeploymentPlan): Record<string, unknown> => ({
    apiVersion: 'v1',
    kind: 'Service',
    metadata: {
        name: OPERATOR_NAME,
        namespace: OPERATOR_NAMESPACE,
        labels: suiteLabels(plan),
    },
    spec: {
        type: 'ClusterIP',
        selector: {
            'app.kubernetes.io/instance': OPERATOR_NAME,
            'app.kubernetes.io/part-of': OPERATOR_NAME,
        },
        ports: [
            {name: 'rpc', port: 8091, targetPort: 'rpc', protocol: 'TCP'},
            {name: 'http', port: 8080, targetPort: 'http', protocol: 'TCP'},
        ],
    },
});

export const installKustomizeTree = (plan: IDeploymentPlan): KustomizeTree => {
    const tree: KustomizeTree = new Map();
    tree.set('namespaces/blong-system.yaml', operatorNamespaceResource(plan));
    tree.set('volumes/blong-operator-artifacts.yaml', operatorCacheClaimResource(plan));
    tree.set('deployments/blong-operator.yaml', operatorDeploymentResource(plan));
    // The operator answers the deployment read API, and a Service is what gives that an address: one
    // per cluster, in the operator's own namespace, because one operator serves every suite it
    // reconciles (@@T-258). A suite's portal cannot front it — an Ingress backend has to be a
    // Service in its own namespace and a selector is namespace-local — so the address belongs to the
    // cluster rather than to a tenant, which is the same reason the operator is installed once.
    tree.set('services/blong-operator.yaml', operatorServiceResource(plan));
    // No `identity` Service here: this process answers the session step itself. The framework's
    // session check (`identity.checkInternal`) is resolved in the process that verified the token —
    // the entry names it in `remote.skipGateway` so it never reaches a gateway — so the name has
    // nothing to resolve to, and the
    // Service that used to publish it selected a pod label for an address no call asks for (@@F-494
    // is now the local answer, not a Service). A suite's tree still generates the namespace Services
    // its own containers answer for, which is the generic path (`unservedNamespaces`).
    // The address the deployment read API answers on, when the installer named one (@@D-523): an Ingress
    // in the operator's own namespace, pointing at the operator's own Service. A suite's portal
    // cannot front it — an Ingress backend has to be a Service in the Ingress's namespace, and a
    // selector is namespace-local — which is also why the deployment page exists only here.
    if (plan.operator.ingress) {
        const {host, path, tls, auth, annotations} = plan.operator.ingress;
        tree.set(
            `ingresses/${ingressName(host)}.yaml`,
            hostIngressResource(
                plan,
                host,
                [
                    {
                        path: path ?? DEFAULT_UI_PATH,
                        pathType: 'Prefix',
                        serviceName: OPERATOR_NAME,
                        servicePort: 8080,
                    },
                ],
                {...annotations, ...authAnnotations(auth, 'blong operator UI')},
                tls,
            ),
        );
    }
    // The operator runs the realm, so it needs the realm's own artifact mounted exactly as a suite's
    // processes do — same path, same link script: the deployment realm is deployed like anything else.
    if (plan.suiteVolume.backend === 'shared') {
        tree.set(`volumes/${plan.suite.name}-${volumeIdentity(plan)}.yaml`, pvcResource(plan));
        tree.set(`deployer/seed.yaml`, seedJobResource(plan));
    } else {
        volumeFillJobs(tree, plan, OPERATOR_NAMESPACE);
    }
    tree.set('rbac/blong-operator-service-account.yaml', operatorServiceAccountResource(plan));
    tree.set('rbac/blong-operator-role.yaml', operatorRoleResource(plan));
    tree.set('rbac/blong-operator-rolebinding.yaml', operatorRoleBindingResource(plan));
    tree.set('rbac/blong-operator-clusterrole.yaml', operatorClusterRoleResource(plan));
    tree.set(
        'rbac/blong-operator-clusterrolebinding.yaml',
        operatorClusterRoleBindingResource(plan),
    );
    tree.set('crd/blongdeployment-crd.yaml', crdResource(plan));
    return stampAndKustomize(tree, plan);
};

/**
 * Stamp every object with its own fingerprint and close the tree with its kustomization files.
 *
 * Shared by both trees — a suite's and the operator's install — which differ in what they contain
 * and not at all in how a kustomize tree is finished. Every object the operator may apply carries a
 */
const stampAndKustomize = (tree: KustomizeTree, plan: IDeploymentPlan): KustomizeTree => {
    for (const [path, resource] of tree) {
        if (isClusterResource(resource)) tree.set(path, stampSpecHash(resource));
    }
    // Only a path with a separator names a folder: a document at the root of the tree — a suite's CR
    // is one — is listed by the root kustomization directly, and treating its name as a folder made
    // the writer try to create a directory where the file goes. Listed *and* passed on: for a while
    // this comment was true of the folder derivation and false of the tree, so the CR was written,
    // stamped and never applied by an `apply -k` — a suite declaring itself to an operator that
    // never saw the declaration, and nothing in the tree said so .
    const rootDocuments = [...tree.keys()]
        .filter(path => !path.includes('/') && path !== 'kustomization.yaml')
        .sort();
    const folders = [
        ...new Set(
            [...tree.keys()].filter(path => path.includes('/')).map(path => path.split('/')[0]),
        ),
    ].sort();
    for (const folder of folders) {
        // A folder that brought its own kustomization keeps it: `secrets/` and `assets/` build their
        // objects with generators, and `storage/` lists the RWX provider's own manifest. Deriving one
        // over the top silently dropped whatever it said.
        if (tree.has(`${folder}/kustomization.yaml`)) continue;
        const files = [...tree.keys()]
            .filter(path => path.startsWith(`${folder}/`))
            .map(path => path.slice(folder.length + 1))
            .sort();
        tree.set(`${folder}/kustomization.yaml`, folderKustomization(files));
    }
    tree.set('kustomization.yaml', rootKustomization(plan, folders, rootDocuments));
    return new Map([...tree.entries()].sort(([a], [b]) => a.localeCompare(b)));
};

/**
 * A folder whose kustomization *builds* its object instead of listing it.
 *
 * Secrets and assets are generator entries on purpose: `envs` and `files` name something the suite
 * owns, so the tree carries a reference rather than a value, and the credential never enters a file
 * this generator writes. Literals remain available for the cases where there is nothing secret.
 */
const generatorKustomization = (
    kind: 'secretGenerator' | 'configMapGenerator',
    entries: IGeneratorEntry[],
    // Named here rather than inherited: what a generator builds carries no namespace of its own, and a
    // *flat* tree has no parent to give it one. This is the one place a generated kustomization names a
    // namespace at all; a split's overlay declares the same one a level up, so the base's value is
    // overridden by the child that includes it rather than disagreeing with it (@@F-440 @@D-506).
    namespace: string,
): Record<string, unknown> => ({
    apiVersion: KUSTOMIZE_API,
    kind: 'Kustomization',
    namespace,
    [kind]: entries.map(entry => ({
        name: entry.name,
        ...(entry.literals
            ? {literals: entry.literals.map(literal => `${literal.key}=${literal.value}`)}
            : {}),
        ...(entry.envs ? {envs: entry.envs} : {}),
        ...(entry.files ? {files: entry.files} : {}),
    })),
});

/** A claim for a volume a realm declared, named after the volume so the mount can find it. */
const componentVolumeResource = (
    plan: IDeploymentPlan,
    volume: IComponentVolume,
): Record<string, unknown> => ({
    apiVersion: 'v1',
    kind: 'PersistentVolumeClaim',
    metadata: {name: volume.name, namespace: plan.suite.namespace, labels: suiteLabels(plan)},
    spec: {
        accessModes: [volume.accessMode ?? 'ReadWriteOnce'],
        ...(volume.storageClassName ? {storageClassName: volume.storageClassName} : {}),
        resources: {requests: {storage: volume.size}},
    },
});

/** `shared` backend: the identity-named PVC the deployer fills. */
const pvcResource = (plan: IDeploymentPlan): Record<string, unknown> => ({
    apiVersion: 'v1',
    kind: 'PersistentVolumeClaim',
    metadata: {
        // Named after the identity rather than the version, so the retention reads identities apart
        // and a second artifact under one version is a claim of its own (@@D-469).
        name: `${plan.suite.name}-${volumeIdentity(plan)}`,
        namespace: plan.suite.namespace,
        labels: {
            ...suiteLabels(plan),
            'blong.feasible.one/suite-version': suiteVersion(plan),
            'blong.feasible.one/volume-identity': volumeIdentity(plan),
        },
        annotations: {'blong.feasible.one/retention': `${plan.suiteVolume.retention}`},
    },
    spec: {
        accessModes: ['ReadWriteMany'],
        ...(plan.suiteVolume.storageClassName
            ? {storageClassName: plan.suiteVolume.storageClassName}
            : {}),
        resources: {requests: {storage: '1Gi'}},
    },
});

/**
 * The image runs as `node` (uid/gid 1000); the suite volume has to be writable by it.
 *
 * Two mechanisms, because the two backends fail differently. A PVC is prepared by the kubelet, so
 * `fsGroup` is enough: it hands the mounted volume to that group. A `hostPath` is not — the kubelet
 * ignores `fsGroup` there, and a directory the node's provisioner made is root-owned, so the fill's
 * first `mkdir` fails with `Permission denied` and no retry gets past it. That one needs to run as
 * root, which the first live deployment proved.
 */
const SUITE_GID = 1000;

/**
 * A deploy-time Job's name: suite, kind, deploy stamp and a hash of what the Job runs
 * (@@D-386 @@D-471 @@F-410 @@F-432).
 */
export const jobName = (plan: IDeploymentPlan, kind: 'seed' | 'migrate'): string =>
    [
        plan.suite.name,
        kind,
        volumeIdentity(plan),
        createHash('sha256')
            .update(
                [
                    kind,
                    plan.suite.name,
                    volumeIdentity(plan),
                    // The container, whole. It carries the image, the entry, the command line, the
                    // mounts and the resources, so a corrected step cannot keep the name of the old
                    // one and be refused as an update (@@F-406 @@F-432).
                    JSON.stringify(
                        kind === 'migrate' ? migrationContainer(plan) : seedContainer(plan),
                    ),
                ].join('|'),
            )
            .digest('hex')
            .slice(0, 8),
    ]
        .join('-')
        .toLowerCase();

/**
 * The container the migration step runs.
 *
 * Built here rather than inside the Job because two things need it: the Job, and the name that Job is
 * given. A step whose container is built twice is a step whose name can drift from what it runs.
 */
const migrationContainer = (plan: IDeploymentPlan): Record<string, unknown> => ({
    name: 'migrate',
    image: image(plan),
    args: migrationArgs(plan),
    volumeMounts: [suiteVolume(plan).mount, ...releaseRc().mounts],
    resources: containerResources(),
});

/** The container the seed step runs — the one that unpacks an artifact into the volume. */
const seedContainer = (plan: IDeploymentPlan): Record<string, unknown> => ({
    name: 'seed',
    image: image(plan),
    // The artifact arrives where the readers look, and this realm's own module does the work rather than a
    // shell that needed `curl` and `unzip` to exist in the image (@@D-518). The mount is the target rather
    // than a root: a `shared` volume is one directory, and there is nothing beside it for retention.
    command: fillCommand(SUITE_MOUNT),
    env: [
        ...(plan.suiteVolume.artifact?.path
            ? [{name: FILL_ENV.path, value: plan.suiteVolume.artifact.path}]
            : [{name: FILL_ENV.url, value: plan.suiteVolume.artifact?.url ?? ''}]),
    ],
    volumeMounts: [
        {name: 'suite', mountPath: SUITE_MOUNT},
        ...releaseRc().mounts,
        fillModuleMount(),
    ],
    resources: containerResources(),
});

/** `shared` backend: the deployer mounts the PVC read-write and seeds it. */
const seedJobResource = (plan: IDeploymentPlan): Record<string, unknown> => {
    const name = jobName(plan, 'seed');
    const selector = {
        'app.kubernetes.io/instance': name,
        'app.kubernetes.io/part-of': plan.suite.name,
    };
    return {
        apiVersion: 'batch/v1',
        kind: 'Job',
        metadata: {
            name,
            namespace: plan.suite.namespace,
            labels: {
                ...suiteLabels(plan),
                ...selector,
                // The two labels a prune works from: which artifact this attempt belongs to, and how
                // many attempts the suite keeps. The second is the *attempt* number rather than the
                // volume one, because the two are unrelated quantities (@@D-471).
                'blong.feasible.one/suite-version': suiteVersion(plan),
                'blong.feasible.one/volume-identity': volumeIdentity(plan),
                'blong.feasible.one/attempt-retention': `${plan.suiteVolume.attemptRetention}`,
            },
        },
        spec: {
            backoffLimit: 0,
            template: {
                metadata: {labels: {...suiteLabels(plan), ...selector}},
                spec: {
                    restartPolicy: 'Never',
                    serviceAccountName: treeServiceAccount(plan),
                    // The claim is mounted writable, so its ownership is the cluster's to arrange:
                    // `fsGroup` makes the kubelet hand the volume over to the image's group.
                    securityContext: {fsGroup: SUITE_GID},
                    containers: [seedContainer(plan)],
                    volumes: [
                        {
                            name: 'suite',
                            persistentVolumeClaim: {
                                claimName: `${plan.suite.name}-${suiteVersion(plan)}`,
                            },
                        },
                        ...releaseRc().volumes,
                        fillModuleVolume(),
                    ],
                },
            },
        },
    };
};

/**
 * The migration step, as a Job: `upgrade` before the suite's intents, and intents before any flag
 * (@@F-414).
 */
export const migrationArgs = (plan: IDeploymentPlan): string[] => [
    plan.suite.entry ?? DEFAULT_SUITE_ENTRY,
    // `upgrade` first, because the trailing intent names the rc file the step reads  and that
    // file is the deployment's, not the step's — and because bringing the schema up to date is what
    // the step is *for*: `upgrade` is the intent that activates the database adapter's
    // `schema.sync` / `schema.seed`, while the `db` intent it replaced named no work at all (@@D-431).
    'upgrade',
    // Nothing else: no `--<realm>.<layer>` selector rides a migration. The step brings *every* realm
    // the suite declares up to date, so it cannot name a subset, and the layers each realm needs for
    // that are the realm's own business — activated by the `upgrade` intent in `core/blong-lib/layers.ts`
    // and, where a realm needs more, in its own `layer.server.ts`. The realms themselves are named by
    // the suite's `upgrade` config block, the way its `k8s` block names them for a planning run
    // .
    ...deploymentIntents(plan.suite.intents),
    // The same one setting the deployment carries, and for the same reason: in a monolith the step
    // runs in the process that serves every namespace, so a call it makes to another of them is a
    // call to itself .
    ...profileArgs(plan),
];

const migrationJobResource = (plan: IDeploymentPlan): Record<string, unknown> => {
    const name = jobName(plan, 'migrate');
    const selector = {
        'app.kubernetes.io/instance': name,
        'app.kubernetes.io/part-of': plan.suite.name,
    };
    return {
        apiVersion: 'batch/v1',
        kind: 'Job',
        metadata: {
            name,
            namespace: plan.suite.namespace,
            labels: {
                ...suiteLabels(plan),
                ...selector,
                'blong.feasible.one/suite-version': suiteVersion(plan),
                'blong.feasible.one/volume-identity': volumeIdentity(plan),
                'blong.feasible.one/attempt-retention': `${plan.suiteVolume.attemptRetention}`,
            },
        },
        spec: {
            // One attempt: a migration that failed is a fact to report, not something to retry
            // until it looks like it worked.
            backoffLimit: 0,
            template: {
                metadata: {labels: {...suiteLabels(plan), ...selector}},
                spec: {
                    restartPolicy: 'Never',
                    serviceAccountName: treeServiceAccount(plan),
                    containers: [migrationContainer(plan)],
                    volumes: [suiteVolume(plan).volume, ...releaseRc().volumes],
                },
            },
        },
    };
};

/**
 * Opt-in RWX storage: a remote manifest (the OpenEBS operator) is referenced
 * from a kustomization so the same apply that deploys the suite installs the
 * provider `shared` needs. Kustomize resolves the URL itself, which is the
 * `remoteBuild` pattern the framework's todo points at.
 */
const storageKustomization = (plan: IDeploymentPlan): Record<string, unknown> => ({
    apiVersion: KUSTOMIZE_API,
    kind: 'Kustomization',
    resources: [plan.suiteVolume.rwxManifest ?? ''],
});

/**
 * The fill Jobs one `nodeLocal` plan needs: one per node the suite runs on.
 *
 * A plan that names no nodes is not a tree — nothing would fill the directories the processes mount —
 * so it says so rather than being written. That is the one thing a caller has to get right, and a
 * silent empty tree would show up as pods that never start rather than as a sentence (@@D-470).
 */
const volumeFillJobs = (tree: KustomizeTree, plan: IDeploymentPlan, namespace: string): void => {
    if (!plan.nodes.length) {
        throw new Error(
            `${plan.suite.name} reads its artifact from a per-node directory, and the plan names no ` +
                'nodes: nothing would fill them. Name the nodes the suite runs on.',
        );
    }
    // The module once for the tree, in the namespace this tree's Jobs run in: the same file for every node
    // and every artifact, because the four values it works from arrive in its environment (@@D-518 @@D-477).
    // It is written here rather than by `artifact.ts` so that it carries the labels every other object of
    // a tree carries — a ConfigMap of the module is an object like any other.
    tree.set('configmaps/fill-script.yaml', {
        apiVersion: 'v1',
        kind: 'ConfigMap',
        metadata: {name: FILL_MODULE.name, namespace, labels: suiteLabels(plan)},
        binaryData: fillModuleData(),
    });
    for (const node of plan.nodes) {
        tree.set(`cache/${fillJobName(plan, node)}.yaml`, fillJobResource(plan, node));
    }
};

/**
 * The fill Job for one node: what makes that node's directory whole before anything reads from it.
 *
 * One Job per node, because the directory is the node's own (`hostPath`): a pod that is not pinned to
 * the node writes to whichever node it lands on, and the others keep an empty directory. The name
 * carries the identity it fills and the node it fills it on, so redeploying one artifact names the same
 * Job — which has completed and is left alone — while a *changed* artifact names a new one and fills a
 * new directory (@@D-469 @@D-470).
 */
export const fillJobName = (plan: IDeploymentPlan, node: string): string =>
    [plan.suite.name, 'fill', volumeIdentity(plan), node].join('-').toLowerCase();

const fillJobResource = (plan: IDeploymentPlan, node: string): Record<string, unknown> => {
    const name = fillJobName(plan, node);
    const selector = {
        'app.kubernetes.io/instance': name,
        'app.kubernetes.io/part-of': plan.suite.name,
    };
    const root = `${SUITE_ROOT}/${plan.suite.name}`;
    const artifact = plan.suiteVolume.artifact;
    return {
        apiVersion: 'batch/v1',
        kind: 'Job',
        metadata: {
            name,
            namespace: plan.suite.namespace,
            labels: {
                ...suiteLabels(plan),
                ...selector,
                'blong.feasible.one/suite-version': suiteVersion(plan),
                'blong.feasible.one/volume-identity': volumeIdentity(plan),
                'blong.feasible.one/retention': `${plan.suiteVolume.retention}`,
            },
        },
        spec: {
            // One retry: a download that failed on a network hiccup is worth a second attempt, and a
            // second failure is a fact about the artifact rather than about the node.
            backoffLimit: 1,
            template: {
                metadata: {labels: {...suiteLabels(plan), ...selector}},
                spec: {
                    restartPolicy: 'Never',
                    serviceAccountName: treeServiceAccount(plan),
                    // Selected by the node's own hostname label rather than pinned by `nodeName`: the
                    // directory this pod writes is a node's filesystem, so which node runs it is the one
                    // thing about it that is not a preference — and a selector the scheduler can refuse is
                    // a failure that names itself, where a name no node has is a pod that never runs.
                    nodeSelector: {'kubernetes.io/hostname': node},
                    containers: [
                        {
                            name: 'fill',
                            image: image(plan),
                            // The module the tree's ConfigMap carries does the work; what differs per node
                            // and per artifact arrives in the environment below, which is why the base can
                            // carry it and the overlay only the values (@@D-477 @@D-518).
                            command: fillCommand(),
                            env: [
                                {name: FILL_ENV.root, value: root},
                                {name: FILL_ENV.identity, value: volumeIdentity(plan)},
                                {name: FILL_ENV.keep, value: `${plan.suiteVolume.retention}`},
                                // One of the two named the artifact: a url for the cluster, a path for a
                                // runbook that unpacks by hand.
                                ...(artifact?.path
                                    ? [{name: FILL_ENV.path, value: artifact.path}]
                                    : [{name: FILL_ENV.url, value: artifact?.url ?? ''}]),
                            ],
                            // The parent, not the identity's own directory: the fill stages a sibling
                            // there and renames it into place, and the retention counts what is left
                            // beside it.
                            volumeMounts: [{name: 'suite', mountPath: root}, fillModuleMount()],
                            resources: containerResources(),
                            // Root, and only here: the volume is a hostPath, so `fsGroup` does not apply
                            // and the directory belongs to the node.
                            securityContext: {runAsUser: 0},
                        },
                    ],
                    volumes: [
                        {
                            name: 'suite',
                            hostPath: {
                                path: root,
                                // The kubelet creates it as root, which the container above also is.
                                type: 'DirectoryOrCreate',
                            },
                        },
                        fillModuleVolume(),
                    ],
                },
            },
        },
    };
};

/**
 * The fill module travels as a ConfigMap each Job mounts.
 *
 * It was shell text inside the template for a turn, which cost nothing while the step was three lines and a
 * `curl`; now the step is a real program — fetched, unpacked and linked by this realm's own code rather than
 * by binaries the framework image had to install — so it is a file `node` starts, and the ConfigMap is what
 * puts it in every node's pod (@@D-518 @@D-477).
 */

/**
 * The `BlongDeployment` CRD — the operator's contract with a suite.
 *
 * The CRD ships with the tree rather than being installed once per cluster, so a
 * suite can be handed to an operator with the same `kubectl apply -k` that
 * deploys it, and the contract lives in the suite's git beside the manifests it
 * describes. The schema names the same fields the planner reads, so a CR and a
 * suite config cannot drift into meaning different things — down to the shapes inside
 * the arrays, because `kubectl` validates strictly: a field a structural schema does not
 * declare fails the apply rather than being pruned, which is how the first live run
 * found the missing external-service ports and artifact source . `spec` is
 * walked against this schema by `theCrOnlySaysWhatItsCrdDeclares`.
 */
const crdResource = (plan: IDeploymentPlan): Record<string, unknown> => ({
    apiVersion: 'apiextensions.k8s.io/v1',
    kind: 'CustomResourceDefinition',
    metadata: {name: 'blongdeployments.blong.feasible.one', labels: suiteLabels(plan)},
    spec: {
        group: 'blong.feasible.one',
        scope: 'Namespaced',
        names: {
            plural: 'blongdeployments',
            singular: 'blongdeployment',
            kind: 'BlongDeployment',
            shortNames: ['bdep'],
        },
        versions: [
            {
                name: OPERATOR_VERSION,
                served: true,
                storage: true,
                subresources: {status: {}},
                additionalPrinterColumns: [
                    {name: 'Suite', type: 'string', jsonPath: '.metadata.name'},
                    {name: 'Profile', type: 'string', jsonPath: '.spec.profile'},
                    {name: 'Volume', type: 'string', jsonPath: '.spec.suiteVolume.backend'},
                    // What the operator last reported, first, because that is the question a reader
                    // opens `kubectl get bdep` with — the declaration is what they wrote themselves.
                    {name: 'Phase', type: 'string', jsonPath: '.status.phase'},
                    {name: 'Observed', type: 'string', jsonPath: '.status.observedVersion'},
                ],
                schema: {
                    openAPIV3Schema: {
                        type: 'object',
                        properties: {
                            spec: {
                                type: 'object',
                                properties: {
                                    version: {type: 'string'},
                                    frameworkImage: {type: 'string'},
                                    minFrameworkVersion: {type: 'string'},
                                    profile: {
                                        type: 'string',
                                        enum: ['namespace', 'realm', 'group', 'monolith'],
                                        // Real defaults (Q4), which is what makes a CR
                                        // self-describing in `kubectl explain` — and what keeps it
                                        // true that a field a CR omits behaves like the field it
                                        // would have spelled out.
                                        default: DEFAULT_PROFILE,
                                    },
                                    entry: {type: 'string'},
                                    intents: {
                                        type: 'array',
                                        items: {type: 'string'},
                                        default: [...DEFAULT_SUITE_INTENTS],
                                    },
                                    groups: {
                                        type: 'object',
                                        additionalProperties: {
                                            type: 'array',
                                            items: {type: 'string'},
                                        },
                                    },
                                    externalServices: {
                                        // A map keyed by the abstract name the suite resolves, for the
                                        // same reason the portals are: the suite's config and the
                                        // tenant's CR each add entries without knowing about the other,
                                        // and a list would make the merge positional — the wrong
                                        // entry's ports beside the right entry's name.
                                        type: 'object',
                                        additionalProperties: {
                                            type: 'object',
                                            required: ['externalName'],
                                            properties: {
                                                externalName: {type: 'string'},
                                                ports: {
                                                    type: 'array',
                                                    items: {
                                                        type: 'object',
                                                        required: ['port'],
                                                        properties: {
                                                            name: {type: 'string'},
                                                            port: {type: 'integer'},
                                                        },
                                                    },
                                                },
                                            },
                                        },
                                    },
                                    // What the deployment brings with it, and what it leaves to an
                                    // installation of its own. Declared because the operator
                                    // regenerates the tree from this declaration: a switch the schema
                                    // prunes is a service that comes back on the next pass, which is
                                    // how a suite that ran its own database had one written for it
                                    // again.
                                    services: {
                                        // Keyed by service name, like the aliases and the portals: a
                                        // tenant switches one off without knowing what else the
                                        // suite brings.
                                        type: 'object',
                                        additionalProperties: {
                                            // Off, or a value of its own — `IServiceConfig`'s two
                                            // shapes. Kubernetes refuses a `type` or a `properties`
                                            // inside an `anyOf` branch and a `type` beside one, so the
                                            // union cannot be written down: the value is accepted
                                            // unpruned, and what it may hold is checked where it is
                                            // read (the plan refuses a key it does not know, which is
                                            // the place a wrong one wants to be caught).
                                            //
                                            // Accepted rather than typed because typing it as a
                                            // boolean would prune the overrides — the same failure as
                                            // not declaring the field at all, one pass later.
                                            'x-kubernetes-preserve-unknown-fields': true,
                                        },
                                    },
                                    servicesNamespace: {type: 'string'},
                                    storageClassName: {type: 'string'},
                                    portal: {
                                        // A map keyed by alias rather than a list, so two releases or
                                        // two overlays can each add a portal without knowing the
                                        // other's position in an array — and the alias is what names
                                        // the portal and its Service.
                                        type: 'object',
                                        additionalProperties: {
                                            type: 'object',
                                            properties: {
                                                // The address and the process, never the content:
                                                // a tenant names the host, and the realm that owns
                                                // the page it serves.
                                                realm: {type: 'string'},
                                                host: {type: 'string'},
                                                path: {type: 'string', default: DEFAULT_UI_PATH},
                                                auth: {
                                                    type: 'object',
                                                    required: ['type'],
                                                    properties: {
                                                        type: {
                                                            type: 'string',
                                                            enum: ['basic', 'oauth2'],
                                                        },
                                                        secretName: {type: 'string'},
                                                        authUrl: {type: 'string'},
                                                    },
                                                },
                                                // The certificate and the controller's own
                                                // annotations travel with the portal because they
                                                // are the host's: a wildcard certificate and an
                                                // issuer are decisions the tenant names, not the
                                                // operator.
                                                tls: {
                                                    type: 'object',
                                                    properties: {secretName: {type: 'string'}},
                                                },
                                                annotations: {
                                                    type: 'object',
                                                    additionalProperties: {type: 'string'},
                                                },
                                            },
                                        },
                                    },
                                    suiteVolume: {
                                        type: 'object',
                                        properties: {
                                            backend: {
                                                type: 'string',
                                                enum: ['auto', 'shared', 'nodeLocal'],
                                                // `auto` is the volume's own fourth value: it
                                                // resolves to `shared` when a storage class or a
                                                // provider is named and to `nodeLocal` otherwise.
                                                default: 'auto',
                                            },
                                            storageClassName: {type: 'string'},
                                            retention: {
                                                type: 'integer',
                                                minimum: 1,
                                                default: DEFAULT_RETENTION,
                                            },
                                            // Two numbers, because they are two quantities: the
                                            // volumes are disk on every node, the attempts are Jobs
                                            // (@@D-471).
                                            attemptRetention: {
                                                type: 'integer',
                                                minimum: 1,
                                                default: DEFAULT_ATTEMPT_RETENTION,
                                            },
                                            rwxProvider: {type: 'string'},
                                            rwxManifest: {type: 'string'},
                                            artifact: {
                                                type: 'object',
                                                required: ['source'],
                                                properties: {
                                                    source: {
                                                        type: 'string',
                                                        enum: ['url', 'path'],
                                                    },
                                                    url: {type: 'string'},
                                                    path: {type: 'string'},
                                                    // What the artifact is, as opposed to where it
                                                    // is: a publisher that hashed what it published
                                                    // names the digest, and a caller that has no
                                                    // hash stamps when the deploy happened. Either
                                                    // one names the volume (@@D-469).
                                                    digest: {type: 'string'},
                                                    deployedAt: {type: 'string'},
                                                },
                                            },
                                        },
                                    },
                                },
                            },
                            status: {
                                type: 'object',
                                properties: {
                                    observedVersion: {type: 'string'},
                                    // The four words a reader acts on, and the counts behind them.
                                    // Declared here because a status field a CRD does not know is
                                    // dropped by the API server rather than stored.
                                    phase: {
                                        type: 'string',
                                        enum: ['Pending', 'Progressing', 'Ready', 'Failed'],
                                    },
                                    deployments: {
                                        type: 'array',
                                        items: {
                                            type: 'object',
                                            properties: {
                                                name: {type: 'string'},
                                                available: {type: 'integer'},
                                            },
                                        },
                                    },
                                    lastResult: {
                                        type: 'object',
                                        properties: {
                                            at: {type: 'string'},
                                            created: {type: 'integer'},
                                            updated: {type: 'integer'},
                                            unchanged: {type: 'integer'},
                                            obsolete: {type: 'integer'},
                                            deleted: {type: 'integer'},
                                            failures: {type: 'integer'},
                                        },
                                    },
                                    message: {type: 'string'},
                                },
                            },
                        },
                    },
                },
            },
        ],
    },
});

/** The CR that asks the operator to keep this suite deployed. */
const blongDeploymentResource = (plan: IDeploymentPlan): Record<string, unknown> => ({
    apiVersion: `${OPERATOR_GROUP}/${OPERATOR_VERSION}`,
    kind: 'BlongDeployment',
    metadata: {
        name: plan.suite.name,
        namespace: plan.suite.namespace,
        labels: suiteLabels(plan),
    },
    spec: {
        version: plan.suite.version,
        frameworkImage: plan.suite.frameworkImage,
        minFrameworkVersion: plan.suite.minFrameworkVersion,
        profile: plan.profile,
        // The entry and the intents travel with the CR because the operator regenerates the tree
        // from it: they are what the artifact's own shape decides, and an operator that assumed the
        // default would rewrite a working Deployment to an entry point that does not exist.
        ...(plan.suite.entry ? {entry: plan.suite.entry} : {}),
        ...(plan.suite.intents ? {intents: plan.suite.intents} : {}),
        suiteVolume: plan.suiteVolume,
        externalServices: externalServiceRequests(plan),
        // The request rather than the resolved form: which process serves a portal follows from the
        // registry the reconciling operator loads, so writing it into the CR would freeze a decision
        // the operator has to make for itself — and the CRD declares no such field, so the API
        // server would prune it on the way in.
        portal: portalRequests(plan),
        // The same rule for the services a deployment brings with it, and one more reason for it: the
        // operator regenerates the tree from this declaration, so a switch the CR cannot carry is a
        // service switched off that comes back on the next pass. Written only when the
        // deployment named something, because a field it omits falls back to the realm's own config.
        ...(Object.keys(plan.backingServiceRequest.services ?? {}).length
            ? {services: plan.backingServiceRequest.services}
            : {}),
        // The namespace the deployment's backing services live in, written even when it named none:
        // it is the same `blong-services` the workloads default to, and a service the declaration has
        // stopped generating still has to be found there to be retired. A field the CR omits sends the
        // operator's lookup of what it managed before to whatever namespace its client falls back to,
        // where its account is refused — so the pass fails instead of retiring anything (@@F-481).
        servicesNamespace:
            plan.backingServiceRequest.servicesNamespace ?? DEFAULT_SERVICES_NAMESPACE,
        ...(plan.backingServiceRequest.storageClassName
            ? {storageClassName: plan.backingServiceRequest.storageClassName}
            : {}),
    },
});

const folderKustomization = (files: string[]): Record<string, unknown> => ({
    apiVersion: KUSTOMIZE_API,
    kind: 'Kustomization',
    resources: files,
});

const rootKustomization = (
    plan: IDeploymentPlan,
    folders: string[],
    documents: string[] = [],
    /**
     * What the label transformer below stamps on every object.
     *
     * The suite's labels by default. A *split* base passes `baseLabels` instead, because the version is
     * the declaration's and a transformer runs after the patches — a version here would overwrite the
     * one every patch puts back (@@D-652). A flat tree has no patches, and keeps it.
     */
    labels: Record<string, string> = suiteLabels(plan),
): Record<string, unknown> => ({
    apiVersion: KUSTOMIZE_API,
    kind: 'Kustomization',
    // A generated kustomization never names a namespace, because the field is a rewrite rather than a
    // default and it is the *deployment* that owns a namespace, not the tree (@@D-506): kustomize moves
    // every namespace-able object into it, overwriting the namespace the object declared, and renames
    // every Namespace object to it — so a tree with a second namespace cannot carry one at all
    // (@@F-440), and a base that carried the suite's namespace would deploy every tenant of the suite
    // into the same one. Every object names its own namespace, and a *split* carries none at all: the
    // overlay's `local/suite/` and `local/services/` declare the two namespaces a deployment has.
    //
    // Folders and root documents in one list, which is what kustomize takes: a folder is a path it
    // resolves itself, and (in the flat layout) a suite's declaration is a resource like any other.
    resources: [...folders, ...documents],
    labels: [{pairs: labels, includeSelectors: false}],
});

/** Build the tree. Keys are tree-relative paths; folders are added last. */
/**
 * The placeholders a base may use, and what each is given for one service.
 *
 * A base names nothing the plan decides: the namespace, the image, the claim it mounts, the ConfigMap
 * its init script arrives in and the Secret its credentials are read from are values, and a
 * placeholder the generator does not know fails the generation rather than reaching a cluster as the
 * literal text `${image}`.
 */
const serviceValues = (service: IBackingService): Record<string, string> => ({
    namespace: service.namespace,
    image: service.image,
    claimName: `${service.name}-data`,
    initConfigName: `${service.name}-init-config`,
    // A base names the Secret its image reads, and the name is resolved whenever the deployment provides
    // credentials at all. A deployment that provides none gets the reference taken out of the object
    // instead, which is why the derived name is filled in either way (@@D-509).
    credentialsSecret: credentialsName(service),
});

/** The name a service's credentials Secret carries: the deployment's, or the one the descriptor derives. */
const credentialsName = (service: IBackingService): string =>
    service.credentialsSecret ?? `${service.name}-credentials`;

/** Fill what one line asks for, or fail naming the file and the placeholder it could not fill. */
const fillPlaceholders = (line: string, path: string, values: Record<string, string>): string =>
    line.replace(/\$\{([a-zA-Z0-9_]+)\}/g, (_match, key: string) => {
        const value = values[key];
        if (value === undefined)
            throw new Error(
                `${path}: unknown placeholder "\${${key}}": a base may use ` +
                    `${Object.keys(values).sort().join(', ')}`,
            );
        // A value the plan resolved as empty is a different failure from a name no base may use:
        // it means the deployment took the service over (its own Secret), so the tree is not the
        // place the object comes from.
        if (value === '')
            throw new Error(
                `${path}: \${${key}} has no value for this service: nothing in this plan ` +
                    'provides one',
            );
        return value;
    });

/** The base of one service, read and rendered into the object the tree carries. */
const renderedServiceBase = (
    plan: IDeploymentPlan,
    service: IBackingService,
    file: string,
): Record<string, unknown> => {
    const path = fileURLToPath(new URL(`./services/${service.name}/base/${file}`, import.meta.url));
    const values = serviceValues(service);
    let text: string;
    try {
        text = readFileSync(path, 'utf8');
    } catch {
        // Half a service is worse than none: without this the tree would carry a claim, an alias and a
        // namespace for a workload nothing runs, and the failure would surface as a database a
        // deployment cannot dial.
        throw new Error(`${path}: a service the plan needs has no base beside its descriptor`);
    }
    // Line by line, and comments are left alone. Every base opens by naming the placeholders a base
    // may use, and substituting over the whole text made that list a dependency: the header of a base
    // for a service with no credentials asked for one, so a file that would have applied failed to
    // generate, with an error naming a comment (@@F-443). A comment describes what a base may say; it
    // does not say it.
    const rendered = text
        .split('\n')
        .map(line =>
            line.trimStart().startsWith('#') ? line : fillPlaceholders(line, path, values),
        )
        .join('\n');
    const document = parse(rendered) as Record<string, unknown>;
    // The workload's identity is the *service's*, stamped rather than trusted: the Service beside it
    // selects `app: <name>`, and a base whose labels drifted would be a deployment that starts and
    // cannot be reached. The suite's labels come with it, because ownership is what a pass reads when
    // it decides whether an object on the cluster is this suite's to update or prune.
    const spec = (document['spec'] ?? {}) as Record<string, unknown>;
    const baseMetadata = (document['metadata'] ?? {}) as Record<string, unknown>;
    document['metadata'] = {
        ...baseMetadata,
        labels: {
            ...suiteLabels(plan),
            ...((baseMetadata['labels'] ?? {}) as object),
            app: service.name,
        },
    };
    const template = (spec['template'] ?? {}) as Record<string, unknown>;
    const metadata = (template['metadata'] ?? {}) as Record<string, unknown>;
    spec['selector'] = {matchLabels: {app: service.name}};
    spec['template'] = {
        ...template,
        metadata: {
            ...metadata,
            labels: {...((metadata['labels'] ?? {}) as object), app: service.name},
        },
        // Where the workload may run, when the deployment named a place. A pod spec is the only place
        // a node selector, a toleration or an affinity belongs, and a rendered base cannot carry one
        // the plan decides — the values arrive with the plan, so the resolution happens here.
        // Shallow, like the labels above: what the deployment names is the last word.
        ...(service.placement
            ? {spec: {...((template['spec'] ?? {}) as object), ...service.placement}}
            : {}),
    };
    // And with the credentials taken out when the deployment declares none: the base is the *service's*
    // shape, and whether a Secret exists is the deployment's answer (@@D-509).
    return service.credentialsSecret === undefined
        ? credentialsFree(document, credentialsName(service))
        : document;
};

/**
 * A base with the credentials it reads taken out, for a deployment that declares none.
 *
 * A base names the Secret its image needs because that is the shape of the service, and only the plan knows
 * whether one exists: a deployment that declares no credentials gets a workload that reads none rather than
 * one that waits for a Secret nobody writes (`CreateContainerConfigError`) — which is what "no secret is
 * mounted" has to mean for a service whose credentials arrive some other way (@@D-509). Matched by name rather
 * than by position, because a base is a template its descriptor's author writes.
 */
const credentialsFree = (
    object: Record<string, unknown>,
    name: string,
): Record<string, unknown> => {
    const template = (object.spec as {template?: {spec?: Record<string, unknown>}} | undefined)
        ?.template;
    const spec = template?.spec;
    if (!spec) return object;
    const strip = (containers: unknown): unknown =>
        Array.isArray(containers)
            ? containers.map(container => {
                  const entry = container as {
                      env?: Array<{valueFrom?: {secretKeyRef?: {name?: string}}}>;
                      envFrom?: Array<{secretRef?: {name?: string}}>;
                  };
                  return {
                      ...entry,
                      ...(entry.env
                          ? {
                                env: entry.env.filter(
                                    item => item.valueFrom?.secretKeyRef?.name !== name,
                                ),
                            }
                          : {}),
                      ...(entry.envFrom
                          ? {
                                envFrom: entry.envFrom.filter(
                                    item => item.secretRef?.name !== name,
                                ),
                            }
                          : {}),
                  };
              })
            : containers;
    return {
        ...object,
        spec: {
            ...(object.spec as Record<string, unknown>),
            template: {
                ...template,
                spec: {
                    ...spec,
                    ...(spec['containers'] ? {containers: strip(spec['containers'])} : {}),
                    ...(spec['initContainers']
                        ? {initContainers: strip(spec['initContainers'])}
                        : {}),
                },
            },
        },
    };
};

/** Where a service's init script is mounted inside its init Job. */
const INIT_SCRIPT_MOUNT = '/opt/blong-init';

/**
 * The Job that initialises a service whose init cannot be a mount of the workload — `initJob: true`
 * in the descriptor says which shape a service is (@@D-466).
 */
const serviceInitJob = (
    plan: IDeploymentPlan,
    service: IBackingService,
    script: string,
): Record<string, unknown> => {
    const digest = createHash('sha256').update(script).digest('hex').slice(0, 8);
    const labels = {app: `${service.name}-init`, ...suiteLabels(plan)};
    const scriptKey = String(service.values?.['initScriptKey'] ?? 'init.sql');
    return {
        apiVersion: 'batch/v1',
        kind: 'Job',
        metadata: {
            name: `${service.name}-init-${digest}`,
            namespace: service.namespace,
            labels,
        },
        spec: {
            backoffLimit: 6,
            template: {
                metadata: {labels},
                spec: {
                    // A server that is not up yet is a retry rather than a failure: a deployment's script
                    // may well wait for one, and a pod that gave up on a race would leave the suite
                    // uninitialised until somebody noticed.
                    restartPolicy: 'OnFailure',
                    containers: [
                        {
                            name: 'init',
                            image: service.image,
                            command: ['sh', `${INIT_SCRIPT_MOUNT}/${scriptKey}`],
                            // The credentials the service is read by, in the environment: an init script
                            // that has to log in to the server it is initialising reads them from there,
                            // and nothing else names them.
                            ...(service.credentialsSecret
                                ? {envFrom: [{secretRef: {name: service.credentialsSecret}}]}
                                : {}),
                            volumeMounts: [
                                {name: 'init', mountPath: INIT_SCRIPT_MOUNT, readOnly: true},
                            ],
                        },
                    ],
                    volumes: [
                        {name: 'init', configMap: {name: serviceValues(service)['initConfigName']}},
                    ],
                },
            },
        },
    };
};

/**
 * What one generated service contributes: the workload from its base, and the objects the descriptor
 * and the plan decide rather than the image — its own Service, the claim it writes into, the init
 * script built from the plan's databases, and the credentials it is read by (Phase 15 I).
 */
const backingServiceResources = (
    plan: IDeploymentPlan,
    service: IBackingService,
): [string, Record<string, unknown>][] => {
    const values = serviceValues(service);
    const labels = {app: service.name};
    const documents: [string, Record<string, unknown>][] = [
        ['deployment.yaml', renderedServiceBase(plan, service, 'deployment.yaml')],
        [
            'service.yaml',
            {
                apiVersion: 'v1',
                kind: 'Service',
                metadata: {
                    name: service.name,
                    namespace: service.namespace,
                    labels: {...labels, ...suiteLabels(plan)},
                },
                spec: {
                    selector: labels,
                    ports: [
                        {
                            name: service.port.name,
                            port: service.port.port,
                            targetPort: service.port.port,
                        },
                    ],
                },
            },
        ],
    ];
    if (service.storage) {
        documents.push([
            'claim.yaml',
            {
                apiVersion: 'v1',
                kind: 'PersistentVolumeClaim',
                metadata: {
                    name: values['claimName'],
                    namespace: service.namespace,
                    labels: {...labels, ...suiteLabels(plan)},
                },
                spec: {
                    accessModes: [service.storage.accessMode ?? 'ReadWriteOnce'],
                    ...(service.storageClassName
                        ? {storageClassName: service.storageClassName}
                        : {}),
                    resources: {requests: {storage: service.storage.size}},
                },
            },
        ]);
    }
    const supplied = service.deploymentInitScript;
    const template = service.values?.['initScript'];
    const script = supplied ?? (typeof template === 'string' ? template : undefined);
    const scriptKey = String(service.values?.['initScriptKey'] ?? 'init.sql');
    if (typeof script === 'string') {
        documents.push([
            'init-config.yaml',
            {
                apiVersion: 'v1',
                kind: 'ConfigMap',
                metadata: {
                    name: values['initConfigName'],
                    namespace: service.namespace,
                    labels: {...labels, ...suiteLabels(plan)},
                },
                // A descriptor's script is a template, and its dialect is the descriptor's: one line per
                // database the plan's connections named, which is the list `upgrade` is about to want a
                // schema in. A deployment's script is not — it is the text of the step that service
                // needs, written as it arrived, because this realm has no opinion about what a realm of
                // Keycloak's contains (@@D-466).
                //
                // Written even when that list is empty, because it is the *base* that mounts it: a
                // suite naming its database only in its release rc leaves the planning view with none
                // to name, and the object the workload mounts then does not exist — a pod that never
                // starts, `MountVolume.SetUp failed for volume "mysql-init": configmap not found`,
                // reported against a service whose tree looked complete (@@T-277).
                data: {
                    [scriptKey]:
                        supplied !== undefined
                            ? supplied
                            : service.databases.length > 0
                              ? service.databases
                                    .map(database => String(script).replace(/\$\{db\}/g, database))
                                    .join('\n') + '\n'
                              : '# the plan named no database: the deployment creates its own\n',
                },
            },
        ]);
        if (service.values?.['initJob'] === true) {
            documents.push(['init-job.yaml', serviceInitJob(plan, service, script)]);
        }
    }
    if (service.credentials && service.credentialsGenerated) {
        const userKey = service.values?.['credentialUserKey'];
        const user = service.values?.['credentialUser'];
        // Supplied values win, and the descriptor's own derivation is what a deployment that asks for it
        // without supplying any gets: derived rather than random, and the same on every pass, because a tree
        // is written again on every reconcile and a password that changed would be a service whose own users
        // stopped matching the Secret beside it (@@D-509).
        const strings =
            service.credentialsValues ??
            Object.fromEntries(
                service.credentials.keys.map(key => [
                    key,
                    key === userKey && user !== undefined
                        ? String(user)
                        : `b${serviceDigest(plan, service, key)}`,
                ]),
            );
        const credentialLabels = {
            ...labels,
            ...suiteLabels(plan),
            // What a pass reads to know this Secret is the tree's rather than a tenant's, so a declaration
            // that stops asking for it can take it with it — in the shared namespace as well, which is where
            // the workload's own copy lives (@@D-509).
            [GENERATED_CREDENTIALS_LABEL]: 'true',
        };
        documents.push([
            'credentials.yaml',
            {
                apiVersion: 'v1',
                kind: 'Secret',
                type: 'Opaque',
                metadata: {
                    name: values['credentialsSecret'],
                    namespace: service.namespace,
                    labels: credentialLabels,
                },
                stringData: strings,
            },
        ]);
        // The same Secret under the same name in the suite's namespace, because that is where the suites's
        // own processes read it: a pod sees only its own namespace, and the copy is what the `envFrom` on
        // every one of its workloads points at (@@D-462 @@D-509). Derived rather than random, so the two copies
        // cannot drift and nothing has to sync them.
        documents.push([
            'credentials-in-suite.yaml',
            {
                apiVersion: 'v1',
                kind: 'Secret',
                type: 'Opaque',
                metadata: {
                    name: values['credentialsSecret'],
                    namespace: plan.suite.namespace,
                    labels: credentialLabels,
                },
                stringData: strings,
            },
        ]);
    }
    return documents;
};

/** One derived value per service and key, stable across passes and different between them. */
const serviceDigest = (plan: IDeploymentPlan, service: IBackingService, key: string): string =>
    createHash('sha256')
        .update(`${plan.suite.name}:${plan.suite.namespace}:${service.name}:${key}`)
        .digest('hex')
        .slice(0, 24);

/** The namespace the generated workloads live in: the deployment's, or the realm's default. */
const servicesNamespace = (service: IBackingService): string => service.namespace;

export const buildKustomizeTree = (plan: IDeploymentPlan): KustomizeTree => {
    // Two trees, and which one this is decides everything else: a suite's, or the operator's own
    // install (Phase 15 A). They share the finishing step and nothing else.
    if (plan.install) return installKustomizeTree(plan);
    const tree: KustomizeTree = new Map();
    tree.set(`namespaces/${plan.suite.namespace}.yaml`, namespaceResource(plan));
    for (const deployment of plan.deployments) {
        tree.set(`deployments/${deployment.name}.yaml`, deploymentResource(plan, deployment));
    }
    for (const service of plan.services) {
        tree.set(`services/${service.name}.yaml`, serviceResource(plan, service));
    }
    // …and one for every namespace a process answers that no realm is named after, because that is
    // the name the resolver resolves a call to (`unservedNamespaces`).
    for (const namespace of unservedNamespaces(plan)) {
        tree.set(`services/${namespace}.yaml`, namespaceServiceResource(plan, namespace));
    }
    for (const external of plan.externalServices) {
        tree.set(
            `external-services/${external.name}.yaml`,
            externalServiceResource(plan, external),
        );
    }
    // What the deployment brings with it (Phase 15 I): one folder per service the plan needs, the
    // alias its own configuration keeps naming, and the namespace the workloads live in. The set is
    // the plan's (`backingServices`), so a service nothing implies is not here to be forgotten.
    if (plan.backingServices.length) {
        const namespace = servicesNamespace(plan.backingServices[0]!);
        tree.set(`namespaces/${namespace}.yaml`, {
            apiVersion: 'v1',
            kind: 'Namespace',
            metadata: {name: namespace, labels: suiteLabels(plan)},
        });
    }
    for (const service of plan.backingServices) {
        for (const [file, document] of backingServiceResources(plan, service)) {
            tree.set(`services/${service.name}/${file}`, document);
        }
        // The alias, in the *suite's* namespace: a realm's config names `mysql`, and this is what
        // makes that name answer wherever the workload happens to run.
        tree.set(
            `external-services/${service.name}.yaml`,
            externalServiceResource(plan, {
                name: service.name,
                externalName: `${service.name}.${service.namespace}.svc.cluster.local`,
                ports: [{name: service.port.name, port: service.port.port}],
            }),
        );
    }
    // One Ingress per host, carrying every path that host serves (Phase 15 C): the portals and the
    // paths realms contribute land in the same object, because a certificate and a DNS record belong
    // to the host rather than to whichever component happened to ask for a path. Two entries at the
    // same path on one host are refused: the controller would answer from whichever it read first,
    // and a silent coin toss is the one outcome nobody can debug.
    const pathsByHost = new Map<string | undefined, IIngressPath[]>();
    const annotationsByHost = new Map<string | undefined, Record<string, string>>();
    const tlsByHost = new Map<string | undefined, {secretName?: string}>();
    const addPath = (host: string | undefined, entry: IIngressPath): void => {
        const paths = pathsByHost.get(host) ?? [];
        const taken = paths.find(path => path.path === entry.path);
        if (taken) {
            throw new Error(
                `two entries claim path "${entry.path}" on host "${host ?? '(none)'}": ` +
                    `${taken.serviceName} and ${entry.serviceName}`,
            );
        }
        paths.push(entry);
        pathsByHost.set(host, paths);
    };
    for (const ingress of plan.ingresses) {
        addPath(ingress.host, {
            path: ingress.path,
            pathType: ingress.pathType,
            serviceName: ingress.serviceName,
            servicePort: ingress.servicePort,
        });
        if (ingress.tls && !tlsByHost.has(ingress.host)) tlsByHost.set(ingress.host, ingress.tls);
    }
    for (const [name, entry] of Object.entries(plan.portal)) {
        // A webhook must not land on a portal's host . The annotations belong to the *host* —
        // that is what makes `auth` apply to the whole Ingress — so a realm's contributed path beside
        // a portal inherits the portal's authentication: an `oauth2` portal would ask a machine for a
        // browser login, and a `basic` one for a password that exists so a human can read a page. The
        // ingress API has no per-path annotations to give the webhook its own, so the tree refuses
        // rather than writing a webhook nobody can call — and the refusal names both sides, because
        // the fix is either moving the path to its own host or moving the portal.
        const contesting = plan.ingresses.filter(ingress => ingress.host === entry.host);
        if (contesting.length) {
            throw new Error(
                `the portal "${name}" shares host "${entry.host ?? '(none)'}" with ` +
                    `${contesting
                        .map(ingress => `"${ingress.path}" (${ingress.serviceName})`)
                        .join(', ')}: the host's annotations are the controller's, so that path ` +
                    `would inherit the portal's authentication`,
            );
        }
        addPath(entry.host, {
            path: entry.path ?? DEFAULT_UI_PATH,
            pathType: 'Prefix',
            serviceName: gatewayServiceName(name),
            servicePort: 8080,
        });
        if (entry.tls && !tlsByHost.has(entry.host)) tlsByHost.set(entry.host, entry.tls);
        // A host's annotations are the controller's, so two portals on one host share them: merging
        // per key is the honest rendering of that, and the doc on `portalAuthAnnotations` says why a
        // portal wanting its own auth wants its own host.
        annotationsByHost.set(entry.host, {
            ...annotationsByHost.get(entry.host),
            ...entry.annotations,
            ...authAnnotations(entry.auth),
        });
    }
    for (const [host, paths] of pathsByHost) {
        tree.set(
            `ingresses/${ingressName(host)}.yaml`,
            hostIngressResource(
                plan,
                host,
                paths,
                annotationsByHost.get(host),
                tlsByHost.get(host),
            ),
        );
    }
    // One Service per portal, in the order the map was declared.
    for (const [name, entry] of Object.entries(plan.portal)) {
        tree.set(
            `services/${gatewayServiceName(name)}.yaml`,
            httpServiceResource(plan, name, entry),
        );
    }
    // Folders that appear only when something asks for them, so a tree never carries a shape
    // nothing reads .
    if (plan.secrets.length > 0) {
        tree.set(
            'secrets/kustomization.yaml',
            generatorKustomization('secretGenerator', plan.secrets, plan.suite.namespace),
        );
    }
    if (plan.assets.length > 0) {
        tree.set(
            'assets/kustomization.yaml',
            generatorKustomization('configMapGenerator', plan.assets, plan.suite.namespace),
        );
    }
    // One claim per declared volume, whoever declared it: two realms asking for the same name mean
    // one volume, not two objects fighting over it.
    const declaredVolumes = new Map<string, IComponentVolume>();
    for (const deployment of plan.deployments) {
        for (const volume of deployment.volumes ?? []) declaredVolumes.set(volume.name, volume);
    }
    for (const volume of declaredVolumes.values()) {
        tree.set(`volumes/${volume.name}.yaml`, componentVolumeResource(plan, volume));
    }
    for (const manifest of plan.manifests) {
        tree.set(manifestPath(manifest), manifest);
    }
    tree.set('rbac/service-account.yaml', serviceAccountResource(plan));
    tree.set('rbac/jobs-role.yaml', roleResource(plan));
    tree.set('rbac/jobs-rolebinding.yaml', roleBindingResource(plan));
    // The operator's rights *in this suite's namespaces*, granted by the suite's own tree: the
    // operator is installed once for the cluster, and which suites it may converge is a property of
    // each tenant rather than of the install (@@D-396). One pair per namespace, named after the
    // operator so a reader can tell what holds it; the pair beyond the suite's own carries the
    // namespace in its name, because the file names have to differ.
    for (const namespace of tenantNamespaces(plan)) {
        const suffix = namespace === plan.suite.namespace ? '' : `-${namespace}`;
        tree.set(
            `rbac/${OPERATOR_NAME}-role${suffix}.yaml`,
            operatorTenantRoleResource(plan, namespace),
        );
        tree.set(
            `rbac/${OPERATOR_NAME}-rolebinding${suffix}.yaml`,
            operatorTenantRoleBindingResource(plan, namespace),
        );
    }
    // The UI's right to ask the cluster about a caller (@@D-376). The role is one object for the whole
    // cluster because its rules are the same for every suite; the binding is not, because its subject
    // is this suite's identity — which is exactly the rule the naming table states (Phase 15 A2).
    tree.set('rbac/auth-review.yaml', authReviewClusterRoleResource(plan));
    tree.set('rbac/auth-review-binding.yaml', authReviewClusterRoleBindingResource(plan));
    if (plan.suiteVolume.backend === 'shared') {
        tree.set(`volumes/${plan.suite.name}-${volumeIdentity(plan)}.yaml`, pvcResource(plan));
        tree.set(`deployer/seed.yaml`, seedJobResource(plan));
    } else {
        volumeFillJobs(tree, plan, plan.suite.namespace);
    }
    if (plan.suiteVolume.rwxManifest) {
        tree.set('storage/kustomization.yaml', storageKustomization(plan));
    }
    if (plan.suite.database) {
        tree.set(`deployer/migrate.yaml`, migrationJobResource(plan));
    }
    if (plan.crd) {
        // The CRD belongs to the operator's install, not here: it is cluster-scoped, and two suites
        // shipping it would race to define one object (@@D-397). What a suite ships is its declaration.
        tree.set(CR_PATH, blongDeploymentResource(plan));
    }

    // Every object the operator may apply carries a fingerprint of itself, so a later
    // reconcile can tell "changed" from "already like this" without comparing against a
    // live object that the API server has decorated with its own defaults (see apply.ts).
    // The kustomization files are build instructions, not objects, and are left alone.
    for (const [path, resource] of tree) {
        if (isClusterResource(resource)) tree.set(path, stampSpecHash(resource));
    }

    return stampAndKustomize(tree, plan);
};

/** Deep-sorted, unfolded YAML so the output is deterministic. */
export const serializeKustomizeTree = (tree: KustomizeTree): Map<string, string> =>
    new Map(
        [...tree.entries()].map(([path, document]) => [
            path,
            typeof document === 'string'
                ? document
                : stringify(document, {lineWidth: 0, sortMapEntries: true}),
        ]),
    );

/**
 * How a tree is written: `flat`, `split`, or one half — `base` or `local` (@@D-475 @@D-488).
 */
export type TreeLayout = 'flat' | 'split' | 'base' | 'local';

/** What a writer needs beyond the tree itself: the layout, and the plan a split needs for its base. */
export interface IWriteTreeOptions {
    layout?: TreeLayout;
    /**
     * The plan the tree was built from. Required by a split and by a base, which hold the artifact and
     * the node names as placeholders.
     */
    plan?: IDeploymentPlan;
}

/**
 * Write the tree to `dir`, replacing whatever was there; `flat`, `split` or `base` decides how much
 * (@@D-395 @@D-475).
 */
export const writeKustomizeTree = (
    tree: KustomizeTree,
    dir: string,
    options: IWriteTreeOptions = {},
): string[] => {
    const layout = options.layout ?? 'flat';
    if (layout === 'split' || layout === 'base' || layout === 'local') {
        if (!options.plan) {
            throw new Error(
                'a split, base or local tree needs the plan it was built from: the base carries a ' +
                    'placeholder for the artifact and the node names, and the overlay replaces them',
            );
        }
        if (layout === 'local') {
            // The overlay is written *beside* a base somebody else wrote — committed, or fetched with
            // the artifact — so only it is replaced, and a directory without a base beside it is
            // refused rather than half-written.
            if (!existsSync(join(dir, 'base'))) {
                throw new Error(
                    `a local tree is written beside a base: ${join(dir, 'base')} is not there — ` +
                        'generate the base first, or point the output at the tree that holds it',
                );
            }
            rmSync(join(dir, 'local'), {recursive: true, force: true});
        } else {
            rmSync(dir, {recursive: true, force: true});
        }
        return writeSplitTree(tree, options.plan, dir, layout);
    }
    rmSync(dir, {recursive: true, force: true});
    const written: string[] = [];
    for (const [path, content] of serializeKustomizeTree(tree)) {
        const full = join(dir, path);
        mkdirSync(dirname(full), {recursive: true});
        writeFileSync(full, content.endsWith('\n') ? content : `${content}\n`);
        written.push(path);
    }
    return written;
};

/**
 * What a split does with one object, decided by the name it already carries: a name the deploy owns
 * becomes a template the overlay instantiates (@@D-475).
 */
type TreePlacement = 'base' | 'instantiated';

/**
 * The declaration as the example beside the base carries it: an address is the tenant's to name.
 *
 * The CR the overlay applies names the real host, and the example is a sample a tenant copies — so the
 * host is the one field it cannot show, because the sample is committed and a domain in it would be a
 * domain in the repository @@D-645. `PLACEHOLDER` is the same token the base uses for everything the
 * deploy owns: a reader sees at a glance which values are theirs to fill in.
 */
const exampleDeclaration = (resource: KustomizeResource): KustomizeResource => {
    if (typeof resource === 'string') return resource;
    const spec = (resource as {spec?: {portal?: Record<string, {host?: string}>}}).spec;
    if (!spec?.portal) return resource;
    const portal = Object.fromEntries(
        Object.entries(spec.portal).map(([alias, entry]) => [
            alias,
            entry.host === undefined ? entry : {...entry, host: PLACEHOLDER},
        ]),
    );
    return {...resource, spec: {...spec, portal}} as KustomizeResource;
};

/**
 * What a split does with one object.
 *
 * The question is the object's *name*, because that is what a patch cannot change: an object named after
 * the artifact — one fill Job per node, one attempt per artifact, one claim per artifact — can only be
 * produced by instantiating a template, and everything else moves into the base as it is. Deciding by the
 * path would be a list to keep in step with the generator; deciding by the name is the rule itself, and it
 * also covers the claims that carry no identity (the operator's own artifact cache) without an exception.
 */
const placementOf = (name: string, plan: IDeploymentPlan): TreePlacement =>
    name.includes(volumeIdentity(plan)) ? 'instantiated' : 'base';

/** The name an object carries, when it carries one: a kustomization and a raw file carry none. */
const nameOf = (resource: KustomizeResource | undefined): string =>
    (resource as {metadata?: {name?: string}} | undefined)?.metadata?.name ?? '';

/**
 * What stands in for a value the deploy owns, in the base.
 *
 * One token rather than a plausible-looking fake: a reader of a committed base has to be able to see at a
 * glance which parts of a template the overlay replaces, and `PLACEHOLDER` in a path, a label or an
 * environment value says so without being mistaken for a working value.
 */
const PLACEHOLDER = 'PLACEHOLDER';

/**
 * Every string in an object that names something the deploy owns, replaced by the placeholder.
 *
 * By value rather than by field, because the same identity is written in several places for different
 * reasons — a label, an environment value, a `hostPath` under the node root, a claim name — and a rule
 * that had to name them would be a rule that goes stale the moment one is added. A value *containing* the
 * identity is replaced too, which is what covers the paths: `<root>/<suite>/<identity>` and
 * `<suite>-<identity>` both carry it inside a longer string.
 */
const placeholderize = (value: unknown, owned: Map<string, string>): unknown => {
    if (typeof value === 'string') {
        let replaced = value;
        for (const [real, placeholder] of owned) {
            if (real) replaced = replaced.split(real).join(placeholder);
        }
        return replaced;
    }
    if (Array.isArray(value)) return value.map(entry => placeholderize(entry, owned));
    if (value && typeof value === 'object') {
        return Object.fromEntries(
            Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
                key,
                placeholderize(entry, owned),
            ]),
        );
    }
    return value;
};

/** The suite volume of a workload, as the object carries it. */
const suiteVolumeOf = (object: Record<string, unknown>): Record<string, unknown> | undefined => {
    const spec = object.spec as
        | {template?: {spec?: {volumes?: Record<string, unknown>[]}}}
        | undefined;
    return (spec?.template?.spec?.volumes ?? []).find(volume => volume.name === 'suite');
};

/** The same volume with a source that names no artifact: what the base of a split tree holds. */
const placeholderVolume = (plan: IDeploymentPlan): Record<string, unknown> =>
    plan.suiteVolume.backend === 'shared'
        ? {name: 'suite', persistentVolumeClaim: {claimName: plan.suite.name, readOnly: true}}
        : {name: 'suite', hostPath: {path: SUITE_MOUNT, type: 'Directory'}};

/**
 * The values a base may not name, and what stands in for them: the artifact's identity — the version and
 * the token taken from the artifact — and the suite's version.
 *
 * Both are the declaration's. `spec.version` decides the version, and the identity is derived from it and
 * from the artifact that same declaration names, so a base that carried either would label a deployment
 * with the values of whichever release happened to generate it — the version that names the volume, the
 * Jobs and every object's `app.kubernetes.io/version` in one place, and the artifact in another.
 *
 * The identity comes first because it *contains* the version: replaced the other way round, a token would
 * survive as `PLACEHOLDER-c698f9b1`.
 */
const ownedByDeploy = (plan: IDeploymentPlan): Map<string, string> => {
    const owned = new Map<string, string>();
    owned.set(volumeIdentity(plan), PLACEHOLDER);
    owned.set(suiteVersion(plan), PLACEHOLDER);
    return owned;
};

/** One label map with the values the deploy owns replaced. */
const placeholderLabels = (
    labels: Record<string, string> | undefined,
    owned: Map<string, string>,
): Record<string, string> | undefined =>
    labels ? (placeholderize(labels, owned) as Record<string, string>) : undefined;

/** The pod's labels, as an object carries them. */
const podLabelsOf = (object: Record<string, unknown>): Record<string, string> | undefined =>
    (object.spec as {template?: {metadata?: {labels?: Record<string, string>}}} | undefined)
        ?.template?.metadata?.labels;

/**
 * The same object with the deploy's values replaced in its labels — its own and its pod's.
 *
 * Labels rather than the whole object, because that is the only place a version appears in a workload: a
 * substitution over the object's data as well would rewrite a ConfigMap's own text or an environment
 * value that happened to carry the version, which is a change nobody asked for and nothing would put
 * back. The identity is separate — it is what the templates are named after — and is replaced by the
 * caller that derives the name.
 */
const withPlaceholderVersionLabels = (
    object: Record<string, unknown>,
    owned: Map<string, string>,
): Record<string, unknown> => {
    const metadata = object.metadata as {labels?: Record<string, string>} | undefined;
    const labels = placeholderLabels(metadata?.labels, owned);
    const podLabels = placeholderLabels(podLabelsOf(object), owned);
    if (!labels && !podLabels) return object;
    const template = (object.spec as {template?: Record<string, unknown>} | undefined)?.template;
    return {
        ...object,
        metadata: {...(object.metadata as Record<string, unknown>), ...(labels ? {labels} : {})},
        ...(podLabels && template
            ? {
                  spec: {
                      ...(object.spec as Record<string, unknown>),
                      template: {
                          ...template,
                          metadata: {
                              ...((template as {metadata?: Record<string, unknown>}).metadata ??
                                  {}),
                              labels: podLabels,
                          },
                      },
                  },
              }
            : {}),
    };
};

/**
 * The patch that puts an object's own labels back where the base carries a placeholder.
 *
 * All of them rather than the ones that changed: the object itself is the only thing that says what they
 * should read, and a label map is merged by key, so the ones the base kept are kept. A patch with nothing
 * but a name would be dropped by the caller, which writes one only where a placeholder is left behind.
 */
const labelPatch = (object: Record<string, unknown>): Record<string, unknown> => {
    const metadata = object.metadata as {name?: string; labels?: Record<string, string>};
    const podLabels = podLabelsOf(object);
    return {
        apiVersion: object.apiVersion,
        kind: object.kind,
        metadata: {
            name: metadata.name,
            ...(metadata.labels ? {labels: {...metadata.labels}} : {}),
        },
        ...(podLabels ? {spec: {template: {metadata: {labels: {...podLabels}}}}} : {}),
    };
};

/** The containers of a workload's pod template, as the object carries them. */
const containersOf = (object: Record<string, unknown>): Record<string, unknown>[] => {
    const spec = object.spec as
        | {template?: {spec?: {containers?: Record<string, unknown>[]}}}
        | undefined;
    return spec?.template?.spec?.containers ?? [];
};

/**
 * The images a workload's containers name, as `[{name, image}]`.
 *
 * `name` is the strategic-merge key, so a patch carrying only these two fields adds or replaces the
 * image and leaves every other field of the container — its args, its environment, its mounts —
 * exactly as the base wrote them.
 */
const imagesOf = (object: Record<string, unknown>): Array<{name: string; image: string}> =>
    containersOf(object)
        .filter(
            container => typeof container.name === 'string' && typeof container.image === 'string',
        )
        .map(container => ({name: container.name as string, image: container.image as string}));

/**
 * The same object with every container image replaced by the placeholder.
 *
 * The image is a value the *deployment* owns — a release names a tag or a digest, a local run names
 * whatever was imported into the local cluster — so a committed base may not carry it (`@@T-449`).
 * It is replaced rather than dropped: a container without an image is not a workload, and a reader of
 * the base has to see that this is one of the fields the overlay puts back.
 */
const withPlaceholderImages = (object: Record<string, unknown>): Record<string, unknown> => {
    const spec = object.spec as
        | {template?: {spec?: {containers?: Record<string, unknown>[]}}}
        | undefined;
    const containers = spec?.template?.spec?.containers;
    if (!containers?.length) return object;
    return {
        ...object,
        spec: {
            ...(object.spec as Record<string, unknown>),
            template: {
                ...spec?.template,
                spec: {
                    ...spec?.template?.spec,
                    containers: containers.map(container =>
                        typeof container.image === 'string'
                            ? {...container, image: PLACEHOLDER}
                            : container,
                    ),
                },
            },
        },
    };
};

/** The same object with one volume entry replaced. */
const withSuiteVolume = (
    object: Record<string, unknown>,
    volume: Record<string, unknown>,
): Record<string, unknown> => {
    const spec = object.spec as {template: {spec: {volumes: Record<string, unknown>[]}}};
    return {
        ...object,
        spec: {
            ...(object.spec as Record<string, unknown>),
            template: {
                ...spec.template,
                spec: {
                    ...spec.template.spec,
                    volumes: spec.template.spec.volumes.map(entry =>
                        entry.name === 'suite' ? volume : entry,
                    ),
                },
            },
        },
    };
};

/**
 * Take the artifact out of a workload, and hand it back as the overlay's patch.
 *
 * A workload names what the deploy owns in three places: the suite volume's source — a `hostPath` on a
 * node's directory or a claim — the image its container runs, and its labels, which carry the suite's
 * version. The base carries none of the three and the overlay replaces all of them, and the two together
 * are the object the tree would have written flat. The image belongs here for the same reason the volume
 * does (`@@T-449`): a release names a tag or a digest, a local run names whatever was imported into the
 * cluster, and a committed base that carried either would overrule the CR the operator composes it with —
 * the first real release fetched its artifact, ran its migration and reported the new version while its
 * pod kept running the image the base had been generated with. The version is the same argument one level
 * down (@@D-652): `spec.version` is what the declaration says, and every object that answers "which
 * build is deployed" has to read it from the patch rather than from the release that generated the base.
 *
 * The fingerprint travels in the patch rather than staying in the base: it hashes the object, and a base
 * fingerprint is the hash of a placeholder, which would read as "changed" to whoever compares it next.
 */
const splitWorkload = (
    plan: IDeploymentPlan,
    object: Record<string, unknown>,
): {base: Record<string, unknown>; patch: Record<string, unknown>} => {
    const metadata = object.metadata as {
        name: string;
        /** The object's own namespace, when it carries one: a service workload is not in the suite's. */
        namespace?: string;
        labels?: Record<string, string>;
    };
    const real = suiteVolumeOf(object);
    const images = imagesOf(object);
    const realPodLabels = podLabelsOf(object);
    return {
        // Re-stamped: the placeholder is what this file holds, and its fingerprint should say so.
        base: stampSpecHash(
            withPlaceholderVersionLabels(
                withPlaceholderImages(withSuiteVolume(object, placeholderVolume(plan))),
                ownedByDeploy(plan),
            ),
        ),
        patch: {
            apiVersion: object.apiVersion,
            kind: object.kind,
            metadata: {
                name: metadata.name,
                // No namespace, because the base's object carries none: the split strips it from every
                // object it moves into the base, and the overlay's `local/suite/` declares the one the
                // deployment has (@@D-506). A patch that named one would target an id the object does not
                // hold — kustomize matches a qualified patch against a qualified object only (verified).
                //
                // All of the object's labels rather than the fingerprint alone, because the version is one
                // of them and the base carries the placeholder (@@D-652). A label map is merged by key,
                // so the labels the base kept are kept.
                ...(metadata.labels ? {labels: {...metadata.labels}} : {}),
            },
            spec: {
                template: {
                    ...(realPodLabels ? {metadata: {labels: {...realPodLabels}}} : {}),
                    spec: {
                        ...(images.length ? {containers: images} : {}),
                        ...(real ? {volumes: [real]} : {}),
                    },
                },
            },
        },
    };
};

/**
 * One object the deploy owns by *name*: how a split carries it in the base, and how the overlay makes it
 * an instance.
 */
interface IInstantiation {
    /** The name the base's template carries: the real name up to the artifact's identity. */
    template: string;
    /** What the deploy appends to it — the identity, and whatever makes this instance its own. */
    suffix: string;
    /** Where the template sits under the base's `templates/`: the kind of object, not the instance. */
    key: string;
    /** The object as the base carries it. */
    object: Record<string, unknown>;
    /** The patch that puts the deploy's values back. */
    patch: Record<string, unknown>;
}

/** The node a fill Job is pinned to, read off the selector the tree gave it. */
const nodeOf = (object: Record<string, unknown>): string | undefined => {
    const spec = object.spec as
        | {template?: {spec?: {nodeSelector?: Record<string, string>}}}
        | undefined;
    return spec?.template?.spec?.nodeSelector?.['kubernetes.io/hostname'];
};

/** One container's environment, as the object carries it. */
const containerEnvOf = (
    object: Record<string, unknown>,
    container: string,
): Record<string, unknown>[] => {
    const spec = object.spec as
        | {
              template?: {
                  spec?: {containers?: Array<{name?: string; env?: Record<string, unknown>[]}>};
              };
          }
        | undefined;
    return spec?.template?.spec?.containers?.find(entry => entry.name === container)?.env ?? [];
};

/**
 * The kinds of object a deploy owns by name, which is what decides how its values are patched back.
 *
 * `fill` is a Job per node, `attempt` a Job per deploy (the seed or the migration), `claim` the volume the
 * `shared` backend reads. The three differ in what the deploy put in them, so the patch does too.
 */
type InstanceKind = 'fill' | 'attempt' | 'claim';

/**
 * Split an object the deploy owns by name into a template and the patch that instantiates it — the
 * template derived, the patch written per kind (@@D-475).
 */
const instantiate = (
    plan: IDeploymentPlan,
    object: Record<string, unknown>,
    {kind, key, node}: {kind: InstanceKind; key: string; node?: string},
): IInstantiation => {
    const metadata = object.metadata as {
        name: string;
        /** The object's own namespace, when it carries one: a service workload is not in the suite's. */
        namespace?: string;
        labels?: Record<string, string>;
    };
    const pod = (
        object.spec as {template?: {metadata?: {labels?: Record<string, string>}}} | undefined
    )?.template;
    const identity = volumeIdentity(plan);
    const at = metadata.name.indexOf(identity);
    if (at < 0) {
        throw new Error(
            `${metadata.name} names no artifact identity (${identity}): a template is named after the ` +
                'artifact up to the identity, and this object cannot be split that way',
        );
    }
    const template = metadata.name.slice(0, at).replace(/-$/, '');
    const suffix = metadata.name.slice(template.length);
    const owned = new Map([[identity, PLACEHOLDER]]);
    if (node) owned.set(node, PLACEHOLDER);
    // The template's own name in the labels that name it: a placeholder would be a name nothing agrees
    // with, and the patch is what makes them agree again.
    const asTemplate = (labels?: Record<string, string>): Record<string, string> | undefined =>
        labels?.['app.kubernetes.io/instance']
            ? {...labels, 'app.kubernetes.io/instance': template}
            : labels;
    const volume = suiteVolumeOf(object);
    // The image leaves the template for the same reason the identity does: the deploy owns it, and a
    // template that kept it would overrule the CR (`@@T-449`). The version leaves the labels for the
    // same reason (@@D-652), and the patch below puts both back.
    const images = imagesOf(object);
    const blank = withPlaceholderVersionLabels(
        withPlaceholderImages(placeholderize(object, owned) as Record<string, unknown>),
        ownedByDeploy(plan),
    );
    const blankMetadata = blank.metadata as {labels?: Record<string, string>} | undefined;
    const patch: Record<string, unknown> = {
        apiVersion: object.apiVersion,
        kind: object.kind,
        metadata: {
            name: template,
            // No namespace, because the base's template carries none either: the split strips it from
            // every object it moves into the base, and the overlay's `local/suite/` declares the one the
            // deployment has (@@D-506). A patch that named one would target an id the template does not
            // hold — kustomize matches a qualified patch against a qualified object only (verified).
            // The object's labels, *all* of them. A placeholder replacement is a value substitution, so a
            // label that merely *read* the identity — the suite's version, say — was destroyed by it, and
            // only the object itself says what such a label should read. Merged over the template's, so
            // every label the base kept is kept.
            labels: {...metadata.labels},
        },
    };
    if (kind !== 'claim') {
        patch.spec = {
            template: {
                metadata: {
                    // The pod's labels too, for the same reason: the identity ran through them.
                    ...(pod?.metadata?.labels ? {labels: {...pod.metadata.labels}} : {}),
                },
                spec: {
                    // The *whole* volume list is not needed and not given: the generator always writes the
                    // suite volume first (`suiteVolume(plan)` heads the list), and a patched entry moves to
                    // the front of its list — so patching the first entry keeps the order it had.
                    ...(volume ? {volumes: [volume]} : {}),
                    ...(node ? {nodeSelector: {'kubernetes.io/hostname': node}} : {}),
                    // The image, in the entry the strategic-merge key matches by name: one entry per
                    // container, carrying the image and — for the fill — the environment a patch that
                    // named one entry alone would move to the front of the list (`@@T-449`).
                    ...(images.length
                        ? {
                              containers: images.map(entry =>
                                  kind === 'fill' && entry.name === 'fill'
                                      ? {...entry, env: containerEnvOf(object, 'fill')}
                                      : entry,
                              ),
                          }
                        : {}),
                },
            },
        };
    }
    return {
        template,
        suffix,
        key,
        // Re-stamped: the placeholder is what this file holds, and its fingerprint should say so.
        object: stampSpecHash({
            ...blank,
            metadata: {
                ...(blank.metadata as Record<string, unknown>),
                name: template,
                // The labels the placeholder pass produced, so the one thing this fixes is the name: taken from
                // the original they would carry the artifact's identity back into the base.
                labels: asTemplate(blankMetadata?.labels),
            },
        }),
        patch,
    };
};

/**
 * Whether a folder's kustomization is one the tree *derived*, rather than one the folder brought.
 *
 * The distinction decides what a split does with it: a derived kustomization lists the files beside it, so
 * a folder split across the base and the overlay would name a file the other side holds — each side
 * derives its own instead. A folder that brought one (`secrets/`, `assets/`, `storage/` build their
 * objects or name a remote manifest) moves whole, and its kustomization goes with it. Comparing against
 * what the derivation produces is exact, because {@link folderKustomization} is its only writer.
 */
const isDerivedKustomization = (
    tree: KustomizeTree,
    folder: string,
    content: KustomizeResource,
): boolean =>
    JSON.stringify(content) ===
    JSON.stringify(
        folderKustomization(
            [...tree.keys()]
                .filter(path => path.startsWith(`${folder}/`))
                .map(path => path.slice(folder.length + 1))
                .filter(name => name !== 'kustomization.yaml')
                .sort(),
        ),
    );

/** The folder a `…/kustomization.yaml` path belongs to, or the empty string at the tree's root. */
const kustomizationFolder = (path: string): string => path.slice(0, -'/kustomization.yaml'.length);

/**
 * The service a tree path belongs to, and the name it takes inside that service's own folder.
 *
 * A backing service is brought by a *deployment* rather than by the suite: `mysql` is not in the tree
 * every deployment applies, it is a folder a deployment opts into, and what exists only because of it
 * travels with it — the workload, its claim and its init config. The two objects that belong to the
 * *suite's* namespace rather than to the workload's do not: the alias a realm's config resolves and the
 * credentials copy a suite pod reads are the overlay's suite child's, because a folder is stamped with
 * the services namespace (@@D-506). `services/access.yaml` is not one of them either: that is a suite's
 * own process, which belongs to the base like any other workload.
 */
const serviceScopeOf = (
    path: string,
    plan: IDeploymentPlan,
): {name: string; at: string} | undefined => {
    for (const service of plan.backingServices) {
        if (path.startsWith(`services/${service.name}/`)) {
            return {name: service.name, at: path.slice(`services/${service.name}/`.length)};
        }
    }
    return undefined;
};

/**
 * Whether an object is a right the operator holds in a service's namespace rather than a service's own
 * file: two services may share one namespace, so the overlay writes the pair once (@@D-504). The namespace
 * *itself* is not among them — it is cluster-scoped and named after the deployment, so the tree writes it
 * at the overlay's root (@@D-506).
 */
const isServicePlumbing = (path: string, plan: IDeploymentPlan): boolean =>
    plan.backingServices.some(
        service => path.startsWith('rbac/') && path.endsWith(`-${service.namespace}.yaml`),
    );

/**
 * Write a base and an overlay from one tree: the split layout.
 *
 * The two roots list files rather than folders, because the folders are what the split takes apart.
 * Deterministic like the flat writer — sorted, unfolded YAML — so two runs of one plan produce the same
 * bytes, which is what makes a committed base reviewable.
 *
 * `layout` is `base` for a caller that wants the base alone, and `local` for one that wants the overlay
 * alone: the derivation runs the same way, and only the writes of the missing half are left out.
 */
/**
 * The same object with no namespace of its own — a split strips it and keeps the fingerprint
 * (@@D-506).
 */
const namespaceFree = (resource: KustomizeResource): KustomizeResource => {
    if (!isClusterResource(resource)) return resource;
    const metadata = resource.metadata as Record<string, unknown> | undefined;
    if (!metadata || !('namespace' in metadata)) return resource;
    const rest = {...metadata};
    delete rest.namespace;
    return {...resource, metadata: rest} as KustomizeResource;
};

const writeSplitTree = (
    tree: KustomizeTree,
    plan: IDeploymentPlan,
    dir: string,
    layout: TreeLayout = 'split',
): string[] => {
    const withBase = layout !== 'local';
    const withOverlay = layout !== 'base';
    /** The design half: everything every deployment of this suite shares. */
    const base = new Map<string, KustomizeResource>();
    /** The templates the overlay instantiates, by kind: written under the base's `templates/`. */
    const templates = new Map<string, Record<string, unknown>>();
    /** One kustomization per instance: the overlay directory it lives in, and what it holds. */
    const instances = new Map<string, Record<string, unknown>>();
    const patches = new Map<string, KustomizeResource>();
    /** The base objects the overlay patches, by their path in the base — what a local run checks against. */
    const patchedPaths = new Set<string>();
    /** The values no object of the base may name, and what stands in for each. */
    const owned = ownedByDeploy(plan);
    // Folder kustomizations to keep verbatim, and the folders whose files they already list: a folder that
    // brought one is not taken apart, so its files must not also be listed by the root.
    const brought: string[] = [];
    /** One folder per backing service the deployment brings, laid out beside the base. */
    const services = new Map<string, Map<string, KustomizeResource>>();
    /** The namespaces the tree creates: cluster-scoped, and named after the deployment that owns them. */
    const namespaces = new Map<string, KustomizeResource>();
    /** What the suite's child owns outright: the aliases the CR may point elsewhere (@@D-506). */
    const suiteOwn = new Map<string, KustomizeResource>();
    /** The rights the operator holds in a service's namespace: the overlay's `services` child. */
    const serviceOwn = new Map<string, KustomizeResource>();
    /** The declaration, which no kustomization applies: a sample a tenant copies. */
    const examples = new Map<string, KustomizeResource>();
    /** The same declaration as this deployment states it: the host, version and digest it applies. */
    const declarations = new Map<string, KustomizeResource>();
    /** The namespace the workloads a deployment brings run in, when it brings one at all. */
    const workloadNamespace = plan.backingServices[0]?.namespace;
    for (const [path, resource] of tree) {
        // The declaration is the tenant's own act — its namespace, the services it brings, the artifact it
        // fetched — and a base every deployment of the suite shares cannot carry any of it (@@D-506), so it
        // travels beside the base as an example to copy.
        if (path === CR_PATH) {
            examples.set(CR_EXAMPLE, exampleDeclaration(resource));
            declarations.set(CR_DECLARATION, resource);
            continue;
        }
        // A Namespace is cluster-scoped and *named* after what it holds, which is exactly what a patch
        // cannot change: the suite's namespace is the CR's own and the services' is the one it names. So
        // both are the overlay's, written where no `namespace:` field can rewrite them.
        if (isClusterResource(resource) && resource.kind === 'Namespace') {
            namespaces.set(path, resource);
            continue;
        }
        // The credentials copy a deployment's own pods read is the *suite's*, not the service's: it lives
        // in the namespace the CR names for the suite, while the workload reads its Secret in the services
        // namespace. So the folder cannot hold it — the overlay stamps a folder with the services namespace
        // — and it cannot share the workload's name in that folder either, because two same-named Secrets in
        // one kustomization are two resources with one id, which kustomize refuses (@@D-506).
        const copied = plan.backingServices.find(
            entry => path === `services/${entry.name}/credentials-in-suite.yaml`,
        );
        if (copied) {
            suiteOwn.set(`credentials/${copied.name}-credentials.yaml`, namespaceFree(resource));
            continue;
        }
        const service = serviceScopeOf(path, plan);
        if (service) {
            const folder = services.get(service.name) ?? new Map<string, KustomizeResource>();
            services.set(service.name, folder);
            folder.set(service.at, namespaceFree(resource));
            continue;
        }
        // The rights the operator holds in a service's namespace are not a service's own files — two
        // services may share one namespace — so the overlay's services child writes them once.
        if (isServicePlumbing(path, plan)) {
            serviceOwn.set(path, namespaceFree(resource));
            continue;
        }
        // An address is what *this* deployment publishes, not a shape the suite has: the host is a DNS
        // record and a certificate somebody owns, named by whoever installs it, so a committed base
        // cannot carry one @@D-645. The overlay's suite child holds the Ingresses, in the namespace
        // they belong to, for the same reason it holds the aliases a CR may point elsewhere.
        if ((resource as {kind?: string}).kind === 'Ingress') {
            suiteOwn.set(path, namespaceFree(resource));
            continue;
        }
        if (path.endsWith('/kustomization.yaml') || path === 'kustomization.yaml') {
            const folder = kustomizationFolder(path);
            if (!folder || isDerivedKustomization(tree, folder, resource)) continue;
            const split = [...tree.keys()].filter(
                candidate =>
                    candidate.startsWith(`${folder}/`) &&
                    placementOf(nameOf(tree.get(candidate)), plan) !== 'base',
            );
            if (split.length) {
                throw new Error(
                    `${folder}/ brings its own kustomization and holds deploy-owned files ` +
                        `(${split[0]}): a split cannot take that folder apart — move the files out, or ` +
                        'teach the split which of them belong to the overlay',
                );
            }
            brought.push(path);
            continue;
        }
        // The alias a realm's own configuration resolves — `db`, not a host — is a value the CR may point
        // somewhere else, so it belongs to the overlay rather than to the base (@@D-506). The alias a
        // *generated* service publishes travels with its folder instead, which is the same answer.
        if (path.startsWith('external-services/')) {
            suiteOwn.set(path, namespaceFree(resource));
            continue;
        }
        const placement = placementOf(nameOf(resource), plan);
        if (placement === 'instantiated' && isClusterResource(resource)) {
            // The name is what the deploy owns here, so the base gets a template and the overlay one
            // kustomization per instance: it includes the template, appends what the deploy adds and
            // patches back the values the template replaced.
            const key =
                resource.kind === 'PersistentVolumeClaim'
                    ? 'claim'
                    : path.startsWith('cache/')
                      ? 'fill'
                      : basename(path, '.yaml');
            const instance = instantiate(plan, resource, {
                key,
                kind:
                    resource.kind === 'PersistentVolumeClaim'
                        ? 'claim'
                        : path.startsWith('cache/')
                          ? 'fill'
                          : 'attempt',
                node: nodeOf(resource),
            });
            templates.set(
                instance.key,
                // The template carries no namespace either: its instance's patch names none, and kustomize
                // matches a patch against an unqualified object only when the patch is unqualified too.
                namespaceFree(instance.object) as Record<string, unknown>,
            );
            const at = `${dirname(path)}/${basename(path, '.yaml')}`;
            if (!withOverlay) continue;
            instances.set(at, {
                apiVersion: KUSTOMIZE_API,
                kind: 'Kustomization',
                // Up out of `local/<folder>/<instance>/` to the tree, then into the base's templates: a
                // directory holding its own kustomization, which is the one reference kustomize resolves
                // without being asked to leave the overlay's root.
                // Up out of `local/suite/<folder>/<instance>/` to the tree, then into the base's templates:
                // a directory holding its own kustomization, which is the one reference kustomize resolves
                // without being asked to leave the overlay's root.
                resources: [
                    `${'../'.repeat(at.split('/').length + 2)}base/templates/${instance.key}`,
                ],
                nameSuffix: instance.suffix,
                patches: [{patch: stringify(instance.patch, {lineWidth: 0, sortMapEntries: true})}],
            });
            continue;
        }
        // Only a workload that reads the suite volume has something the overlay must put back: patching
        // one that has no volume to replace writes a patch with nothing in it — a `volumes` list holding
        // a null — and takes a service's own Deployment out of the base for no reason.
        if (
            isClusterResource(resource) &&
            resource.kind === 'Deployment' &&
            suiteVolumeOf(resource)
        ) {
            const {base: placeholder, patch} = splitWorkload(plan, resource);
            base.set(path, namespaceFree(placeholder));
            patches.set(`patches/${basename(path)}`, patch);
            patchedPaths.add(path);
            continue;
        }
        // Everything else in the base is applied as it stands, so the one value it may not carry is one a
        // patch can put back: the suite's version, in its labels (@@D-652). A base that named it would
        // label a Service, a Role or the fill module's ConfigMap with whichever release generated the tree,
        // and no overlay would ever correct it — which is why the label leaves the object *and* the label
        // transformer (`baseLabels`), and the patch below is named after the path rather than the basename:
        // a realm's `deployments/access.yaml` and its `services/access.yaml` share one.
        if (typeof resource !== 'string') {
            const blank = withPlaceholderVersionLabels(resource, owned);
            if (JSON.stringify(blank) !== JSON.stringify(resource)) {
                base.set(path, namespaceFree(blank));
                patches.set(`patches/${path.replaceAll('/', '-')}`, labelPatch(resource));
                patchedPaths.add(path);
                continue;
            }
        }
        base.set(path, namespaceFree(resource));
    }
    const filesOf = (entries: Map<string, KustomizeResource>): string[] =>
        [...entries.keys()].filter(path => path.endsWith('/kustomization.yaml') === false).sort();
    const roots: Array<[string, KustomizeResource]> = [];
    // Each half is written where the other one already is: a base-only run stops before the overlay, and
    // a local-only run has no base to write .
    if (withBase) {
        roots.push([
            'base/kustomization.yaml',
            {
                ...rootKustomization(plan, [], [], baseLabels(plan)),
                // The templates are deliberately absent: they are the shape an instance is built from, and
                // instantiating one is the overlay's business. A reader looking for what a fill Job *is*
                // finds it in `templates/`, and what *this* deploy's fill Jobs are in `local/`.
                resources: [...brought, ...filesOf(base)].sort(),
            },
        ]);
    }
    if (withOverlay) {
        // The overlay's root names no namespace, because its two children each declare one and a field
        // here would rewrite both: kustomize's namespace transformer runs over everything a child brought
        // (verified against kubectl), so the services' workloads would land in the tenant's namespace and
        // the two Namespace objects would collide (@@F-440 @@D-506).
        roots.push([
            'local/kustomization.yaml',
            {
                apiVersion: KUSTOMIZE_API,
                kind: 'Kustomization',
                resources: [
                    'suite',
                    ...(services.size || serviceOwn.size ? ['backing'] : []),
                    ...[...namespaces.keys()].sort(),
                ],
            },
        ]);
        // The suite's half: the base every deployment shares, the aliases the CR may point elsewhere, and
        // the instances the base carries as templates. It takes the CR's namespace, which is where the
        // deployment's own objects belong.
        roots.push([
            'local/suite/kustomization.yaml',
            {
                apiVersion: KUSTOMIZE_API,
                kind: 'Kustomization',
                namespace: plan.suite.namespace,
                resources: ['../../base', ...filesOf(suiteOwn), ...[...instances.keys()].sort()],
                ...(patches.size
                    ? {patches: [...patches.keys()].sort().map(path => ({path}))}
                    : {}),
            },
        ]);
        // And the services' half: one folder per service this deployment brings, plus the rights the
        // operator holds in their namespace. A deployment opts a service in by naming it, and the overlay
        // is where that opt-in is written down — the base beside it says nothing about any service (@@D-504).
        // Named `backing` rather than `services`, because the base itself has a `services/` folder (the
        // suite's own process Services) and a composer reads the two halves by path.
        if (services.size || serviceOwn.size) {
            roots.push([
                'local/backing/kustomization.yaml',
                {
                    apiVersion: KUSTOMIZE_API,
                    kind: 'Kustomization',
                    ...(workloadNamespace ? {namespace: workloadNamespace} : {}),
                    resources: [
                        ...[...services.keys()].sort().map(name => `../../services/${name}`),
                        ...filesOf(serviceOwn),
                    ],
                },
            ]);
        }
    }
    // A local-only run is applied beside a base somebody else wrote — committed, or fetched with the
    // artifact — so the two have to be one generation: an instance referencing a template the base does
    // not hold, or a patch whose object is not there, composes into something nobody wrote. Say it here
    // rather than let kustomize report a missing target later .
    if (layout === 'local') {
        const absent = [
            ...[...templates.keys()].map(key => `base/templates/${key}/${TEMPLATE_FILE}`),
            ...[...patchedPaths].map(path => `base/${path}`),
        ].filter(path => !existsSync(join(dir, path)));
        if (absent.length) {
            throw new Error(
                'the base beside this overlay is not the one this plan generates: ' +
                    `${absent.slice(0, 3).join(', ')} ${absent.length === 1 ? 'is' : 'are'} not there — ` +
                    'regenerate the base, or write both halves together (layout split)',
            );
        }
    }
    const written: string[] = [];
    const write = (path: string, content: string): void => {
        const full = join(dir, path);
        mkdirSync(dirname(full), {recursive: true});
        writeFileSync(full, content.endsWith('\n') ? content : `${content}\n`);
        written.push(path);
    };
    const sides: Array<[string, Map<string, KustomizeResource>]> = [];
    if (withBase) sides.push(['base', base]);
    if (withOverlay) {
        sides.push(['local/suite', patches]);
        sides.push(['local/suite', suiteOwn]);
        sides.push(['local/backing', serviceOwn]);
        sides.push(['local', namespaces]);
    }
    for (const [side, entries] of sides) {
        for (const [path, content] of serializeKustomizeTree(entries))
            write(`${side}/${path}`, content);
    }
    // A template is a directory with a kustomization, because that is what an instance includes: the file
    // alone would be a reference kustomize refuses to resolve from outside the overlay's root.
    for (const [key, content] of withBase ? templates : []) {
        write(
            `base/templates/${key}/kustomization.yaml`,
            stringify(
                {
                    apiVersion: KUSTOMIZE_API,
                    kind: 'Kustomization',
                    resources: [TEMPLATE_FILE],
                },
                {lineWidth: 0, sortMapEntries: true},
            ),
        );
        write(
            `base/templates/${key}/${TEMPLATE_FILE}`,
            stringify(content, {lineWidth: 0, sortMapEntries: true}),
        );
    }
    // The declaration beside the base rather than in it: a sample a tenant copies, and no kustomization
    // lists it (@@D-506).
    for (const [path, content] of withBase ? serializeKustomizeTree(examples) : []) {
        write(path, content);
    }
    // And the one a run applies, with the address and the artifact this deployment was given: the overlay
    // is the half that holds what one deploy says, and it is not committed @@D-645.
    for (const [path, content] of withOverlay ? serializeKustomizeTree(declarations) : []) {
        write(path, content);
    }
    for (const [at, content] of withOverlay ? instances : []) {
        write(
            `local/suite/${at}/kustomization.yaml`,
            stringify(content, {lineWidth: 0, sortMapEntries: true}),
        );
    }
    // The service folders are written last of the halves: one the artifact shipped is used as it stands
    // (the zip decides, because the folder is the suite's to keep and to review), and one it did not is
    // written here, with the kustomization the overlay includes it by (@@D-504).
    for (const [name, folder] of [...services.entries()].sort()) {
        if (!withBase && existsSync(join(dir, `services/${name}/kustomization.yaml`))) continue;
        const files = [...folder.keys()].filter(path => path !== 'kustomization.yaml').sort();
        if (!folder.has('kustomization.yaml')) {
            folder.set('kustomization.yaml', folderKustomization(files));
        }
        for (const [path, content] of serializeKustomizeTree(folder)) {
            write(`services/${name}/${path}`, content);
        }
    }
    for (const [path, content] of serializeKustomizeTree(new Map(roots))) write(path, content);
    return written.sort();
};

/**
 * Where the artifact's own entry point sits inside a directory it was unpacked into.
 *
 * A deployment's entry is an absolute path inside the mount (`SUITE_MOUNT/...`), and the operator
 * reads the same artifact from its cache directory instead: the suffix after the mount is the path
 * within the artifact, whatever directory it is unpacked into — which the fill makes literal by
 * rewriting the artifact's links as relative ones (@@D-476). An entry that names no mount is taken as
 * already relative, and an artifact with no entry of its own falls back to `index.ts` at its root,
 * which is what `rush deploy` produces for a package whose entry is the conventional one.
 */
export const artifactEntry = (dir: string, entry?: string): string => {
    const relative = entry?.startsWith(`${SUITE_MOUNT}/`)
        ? entry.slice(SUITE_MOUNT.length + 1)
        : (entry ?? 'index.ts');
    return join(dir, relative);
};

/**
 * Read a tree back from disk.
 *
 * The inverse of {@link writeKustomizeTree}, and the operator's half of a generation that happened in
 * another process: the child writes the tree the CR asked for and the pass applies what it wrote
 * (@@D-395). YAML is parsed rather than merely copied because the objects have to be compared with the
 * cluster — and parsing keeps the fingerprint the generator stamped on each one, which is what lets
 * an unchanged object be left alone rather than re-applied.
 */
export const readKustomizeTree = (dir: string): KustomizeTree =>
    new Map(
        readdirSync(dir, {recursive: true})
            .map(path => String(path))
            .filter(path => statSync(join(dir, path)).isFile())
            .map(path => {
                const content = readFileSync(join(dir, path), 'utf8');
                // Parsed rather than classified by name: a kustomization is an object in the tree
                // like any other document, and only content that is not YAML at all comes back as
                // the text it was, so a tree carrying a raw file still reads back whole.
                return [path, parsedOrText(content)] as const;
            }),
    );

/** A document as the tree holds it: parsed when it is YAML, otherwise the text itself. */
const parsedOrText = (content: string): KustomizeResource => {
    try {
        const parsed = parse(content) as unknown;
        return parsed && typeof parsed === 'object' ? (parsed as KustomizeResource) : content;
    } catch {
        return content;
    }
};
