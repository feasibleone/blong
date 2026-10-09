/**
 * plan.ts — the deployment model and the pure planner that derives it from a
 * view of the loaded registry.
 *
 * This module is deliberately NOT inside a layer folder: the framework scans
 * layer folders for handlers, and a plain module there is reported as "generic
 * source code in a handler group folder". It carries no framework import, so it
 * can be unit-tested directly and reused by both the `k8s` port and the
 * `kustomize.plan.find` handler.
 */
import {
    type IBackingService,
    type IBackingServiceRequest,
    type IServiceConfig,
    type IServiceDescriptor,
    loadServiceCatalog,
    resolveBackingServices,
} from './services.ts';

/**
 * How the suite is split into processes.
 *
 * Four names, and a name the planner does not know is refused rather than folded into `monolith`:
 * `namespace` is one process per orchestrator namespace, `realm` (the default) one per realm,
 * `group` takes the explicit `groups` map, and `monolith` puts everything in one process. The
 * `layer` and `custom` spellings that used to sit here are gone: layer granularity is what a
 * `group` entry's `<realm>.<layer>` selectors express, and `custom` was that same map under a
 * second name (Phase 15 C, T-231).
 */
export type DeploymentProfile = 'namespace' | 'realm' | 'group' | 'monolith';

/**
 * How a realm takes part in a deployment.
 *
 * A **service** realm becomes a process of its own and owns the namespaces its orchestrators answer
 * for; a **companion** is carried by every process — a library realm whose private API has to be
 * reachable in-process, or infrastructure every microservice repeats (the DB adapter and subject
 * orchestrator pair) — and owns none, so it publishes no Service; **both** is a companion that also
 * owns a process, which is how an in-process library realm offers a public API of its own; **none**
 * is not deployed at all (a dev-only utility realm, the deployment realm itself).
 *
 * Declared by the realm in its own `activation.k8s` block, so a component keeps saying how it
 * deploys, with a suite-config override for realms that do not declare one yet.
 */
export type RealmRole = 'service' | 'companion' | 'both' | 'none';

/** How the artifact the processes run from is stored and shared. */
export type SuiteVolumeBackend = 'shared' | 'nodeLocal';

/** A handler group as the framework's `registry.describe()` reports it. */
export interface IRegistryGroup {
    /** Registry id, `<realm>.<folder>`. */
    name: string;
    handlerCount: number;
    /** Layer folder the group lives in (`adapter`, `orchestrator`, `meta`, ...). */
    layer?: string;
    /** Path of the group folder or file, relative to the working directory. */
    path?: string;
}

/** One container port a component contributes through `activation.k8s`. */
export interface IComponentPort {
    name: string;
    port: number;
    containerPort?: number;
    protocol?: string;
}

/** One ingress path a component contributes (a webhook endpoint, typically). */
export interface IComponentIngress {
    name: string;
    path: string;
    host?: string;
    pathType?: 'Prefix' | 'Exact' | 'ImplementationSpecific';
    /** Defaults to the deployment that owns the contributing realm. */
    serviceName?: string;
    /** Defaults to 8080. */
    servicePort?: number;
    tls?: {secretName?: string};
}

/**
 * The Kubernetes contribution a component declares in its `activation.k8s`
 * block. The framework already merges activation config per active intent, so a
 * realm or adapter contributes by co-locating these keys in its layer file —
 * there is no separate descriptor to keep in step.
 */
/**
 * A kustomize generator entry: a Secret or a ConfigMap built when the tree is rendered.
 *
 * Values may be literals, but the form worth using names a file the suite owns — `envs` for a
 * secret, `files` for an asset tree — so the tree carries a reference rather than a credential.
 * That is the whole reason kustomize has generators instead of plain objects, and it is why this
 * realm emits an entry rather than the resolved Secret.
 */
export interface IGeneratorEntry {
    name: string;
    literals?: {key: string; value: string}[];
    /** Files of `KEY=value` lines, relative to the folder the entry is written into. */
    envs?: string[];
    /** Files or globs, relative to the folder the entry is written into. */
    files?: string[];
}

/** A volume a realm owns, and where that realm's own process should see it. */
export interface IComponentVolume {
    name: string;
    size: string;
    /** Where the contributing realm's process mounts it. */
    mountPath: string;
    accessMode?: string;
    storageClassName?: string;
}

export interface IComponentK8sConfig {
    k8sReplicas?: number;
    k8sResources?: {
        requests?: Record<string, string>;
        limits?: Record<string, string>;
    };
    k8sPorts?: IComponentPort[];
    k8sIngresses?: IComponentIngress[];
    k8sEnv?: {name: string; value: string}[];
    /** Raw extra manifests, written next to the generated ones. */
    k8sManifests?: Record<string, unknown>[];
    /** Secrets the realm declares, emitted as generator entries rather than as literals. */
    k8sSecrets?: IGeneratorEntry[];
    /** Static files the realm serves, emitted as ConfigMap generators. */
    k8sAssets?: IGeneratorEntry[];
    /** Volumes the realm owns; its own process mounts them. */
    k8sVolumes?: IComponentVolume[];
}

/** An attached port (adapter/orchestrator) and the namespace it answers for. */
export interface IRegistryPort {
    id: string;
    namespace?: string | string[];
    /** The component kind (`dispatch` for an orchestrator, `knex`/`k8s` for an adapter). */
    type?: string;
    /** The database its connection names, for the adapters that carry one: the plan's schema list. */
    database?: string;
    /** The component's `activation.k8s` contribution, if it declared one. */
    k8s?: IComponentK8sConfig;
}

/** The framework-facing part of `IRegistry` this module reads. */
export interface IDescribeCapable {
    describe?: () => {
        realms?: string[];
        ports?: string[];
        groups?: {name: string; handlerCount: number}[];
        folders?: {group: string; realm: string; dir: string}[];
        files?: {group: string; realm: string; file: string}[];
        layerFiles?: unknown[];
        /** What each realm declares about itself, keyed by realm name — where `k8sRealmRole` lives. */
        realmConfig?: Record<string, unknown>;
    };
    getPort?: (id: string) =>
        | {
              config?: {
                  namespace?: string | string[];
                  type?: string;
              } & Partial<IComponentK8sConfig>;
          }
        | undefined;
}

/** The registry reduced to what the planner needs, and nothing framework-specific. */
export interface IRegistryView {
    realms: string[];
    groups: IRegistryGroup[];
    ports: IRegistryPort[];
    /** What each realm is in a deployment, when it declared a role. */
    roles: Record<string, RealmRole>;
}

/** One process in the plan (a Kubernetes Deployment). */
export interface IDeployment {
    name: string;
    realms: string[];
    /** `<realm>.<layer>` pairs activated in this process. */
    layers: string[];
    /** Orchestrator namespaces this process answers for. */
    namespaces: string[];
    replicas: number;
    /** Merged from the realms' `activation.k8s` contributions. */
    resources?: {
        requests?: Record<string, string>;
        limits?: Record<string, string>;
    };
    ports?: IComponentPort[];
    env?: {name: string; value: string}[];
    /** Volumes this process mounts, contributed by the realms it serves. */
    volumes?: IComponentVolume[];
}

/**
 * What a generated process gets when no realm asks for more.
 *
 * A container with no `resources` is BestEffort to the scheduler: the first to be evicted under
 * pressure, and free to take a node's memory with it before anything notices. The plan therefore
 * carries this default rather than leaving the field empty, and a realm that knows better says so
 * with `k8sResources` — the contribution is merged over it.
 *
 * Both a request and a limit are named for both resources, because a cluster that enforces limits
 * refuses a container that has none. The CPU limit is a ceiling rather than a throttle: one core is
 * what a single replica of these processes has work for, it stops one replica from taking a whole
 * node with a busy loop, and a burst still fits inside it.
 */
export const DEFAULT_RESOURCES: NonNullable<IDeployment['resources']> = {
    requests: {cpu: '50m', memory: '128Mi'},
    limits: {cpu: '1', memory: '512Mi'},
};

/** A Kubernetes Service generated for an orchestrator namespace. */
export interface IService {
    /** Abstract name the suite resolves (the orchestrator namespace). */
    name: string;
    namespace: string;
    deployment: string;
}

/** A third-party service the suite refers to by an abstract name. */
export interface IExternalService {
    name: string;
    externalName: string;
    ports?: {name?: string; port: number}[];
}

/**
 * Turn the declared map into the list the generator renders, refusing a shape it cannot mean.
 *
 * The declaration is a **map keyed by the abstract name** the suite resolves (`db` →
 * `mysql.…svc.cluster.local`), in the suite's config and in the CR alike, and the alias is what
 * names the generated Service. A CR is data from outside this process, so the shape is checked
 * rather than assumed: an entry the plan cannot name produced a Service called `0` with no
 * `externalName` — written from a stale CR that still carried the list form — and the apply failed
 * with `Missing key value for ?key?`, naming neither the field nor the CR (F-405). Refusing here
 * fails the generation instead, where the message can say what is wrong.
 */
export const resolveExternalServices = (
    request: IExternalServiceMap | undefined | unknown,
): IExternalService[] => {
    if (request === undefined || request === null) return [];
    if (Array.isArray(request)) {
        throw new Error(
            'externalServices is a list, but it is a map keyed by the name the suite resolves ' +
                '(an older CR carried the list form) — rewrite it as {"<name>": {"externalName": …}}',
        );
    }
    if (typeof request !== 'object') {
        throw new Error(
            `externalServices is a ${typeof request}, but it is a map keyed by the name the suite resolves`,
        );
    }
    return Object.entries(request as IExternalServiceMap).map(([name, service]) => {
        const entry = service as IExternalService | undefined;
        if (!name) {
            throw new Error(
                'an external service declares no name: the key of externalServices is the name the ' +
                    'suite resolves, and it names the generated Service',
            );
        }
        if (!entry?.externalName) {
            throw new Error(
                `the external service "${name}" declares no externalName, so the Service that would ` +
                    'carry the suite to it addresses nothing',
            );
        }
        // `Object.assign` rather than `{name, ...entry}`: TypeScript refuses a literal that declares a
        // property the spread also carries, and the entry's own name is the one that has to win (an
        // explicit `name: x` in the entry used to overwrite the derived one silently).
        return Object.assign({name}, entry);
    });
};

/**
 * External services as they are *declared*: by alias, without spelling the name twice.
 *
 * A collection in configuration is a map rather than an array, because an array cannot be merged:
 * with two sources — the suite's own config and the tenant's CR — an entry added by one has no key
 * for the other to leave alone, and the merge this plan runs (`deepMerge`) would combine the two by
 * position, which silently pairs the wrong fields. The alias is the abstract name the suite resolves,
 * so it is also what the generated `ExternalName` Service is called and what an error quotes.
 */
export type IExternalServiceMap = Record<string, Omit<IExternalService, 'name'>>;

/** A resolved ingress rule (a component contribution bound to a Service). */
export interface IIngress {
    name: string;
    namespace: string;
    host?: string;
    path: string;
    pathType: string;
    serviceName: string;
    servicePort: number;
    tls?: {secretName?: string};
}

/** Where the deployer fetches the suite artifact from (Phase 6). */
export interface ISuiteArtifact {
    /** `url` is the cluster path (GitHub release zip); `path` is the local dev path. */
    source: 'url' | 'path';
    url?: string;
    path?: string;
    /**
     * sha256 of the published archive, when the publisher computed one.
     *
     * The identity of the artifact, and the reason a volume can be new under an unchanged version: two
     * deploys that ship different files are two artifacts, and only something taken from the artifact
     * can tell them apart (D-469). A publisher has it for free — the runbook hashes the zip it just
     * wrote — while an artifact nobody hashed names {@link deployedAt} instead.
     */
    digest?: string;
    /**
     * When this deploy was stamped, for an artifact nobody hashed.
     *
     * An input rather than a reading of the clock: the operator regenerates the tree on every reconcile
     * pass, so a value taken *then* would mint a new volume and a new attempt every pass (D-469). Eight
     * characters of it name the volume, hashed when the stamp is not itself hex.
     */
    deployedAt?: string;
}

/**
 * A published entry point: an address, and the process behind it.
 *
 * A suite may publish more than one, because a portal is an address rather than a property of the
 * suite: two hostnames that answer different things are two entries, and each is served by the
 * process that owns the page it shows. What a portal *serves* is that process's own business — the
 * bundle it mounts is the gateway config of whoever fronts it — so this names the address and the
 * process and says nothing about content.
 *
 * A portal usually belongs to the *tenant*: the host is a DNS record and a TLS certificate, and the
 * ingress controller that enforces the auth annotations is the cluster's. So a suite declares that
 * it has a portal and the tenant names the host in the CR (see `IPlanOptions.portal`).
 *
 * Portals are a **map keyed by alias** rather than a list, and the alias is what names the portal:
 * an alias is a name a person chose, so it is stable across a profile change in a way that a
 * deployment name is not, and it is the word the errors and the generated objects use. A map also
 * merges where a list cannot — two releases, a suite and a CR, or two overlays can each add a portal
 * without either having to know the other's position in an array.
 *
 * Auth is delegated to the cluster on purpose. The realm generates an Ingress
 * whose annotations the ingress controller already understands, so the operator
 * authenticates against infrastructure they own instead of against a user table
 * this realm would have to keep — and which would drag in a database the realm
 * deliberately does not have.
 */
/**
 * The ingress-level authentication a host may sit behind.
 *
 * The realm writes the controller's own annotations rather than a login page (see
 * `portalAuthAnnotations` in `generator.ts`): basic auth from a Secret, or delegation to an oauth2
 * proxy. Shared by a portal and by the operator's own address, because both are a page a human opens
 * and both are the cluster's to authenticate.
 */
export type IPortalAuth = {type: 'basic'; secretName?: string} | {type: 'oauth2'; authUrl?: string};

export interface ISuitePortalRequest {
    /**
     * The realm whose own process serves it. Omitted only when the suite has exactly one process,
     * which is the one case where the question has a single answer (see `planFromRegistry`).
     */
    realm?: string;
    /** The DNS name it answers on. Omitted means every host, of which a namespace may have one. */
    host?: string;
    /** Path prefix the portal answers on (default `/`). */
    path?: string;
    auth?: IPortalAuth;
}

/** A portal with its process resolved, which is what the generator renders. */
export interface ISuitePortal extends ISuitePortalRequest {
    /** The deployment behind it. The portal's own name, and its Service's, is the map key. */
    deployment: string;
}

/** The portals a suite or a CR declares, by alias. */
export type ISuitePortalMap = Record<string, ISuitePortalRequest>;

/** The portals a plan carries: the same map, each entry naming the process behind it. */
export type IResolvedPortalMap = Record<string, ISuitePortal>;

/** The versioned artifact volume (see the SuiteVolume abstraction in Phase 6). */
export interface ISuiteVolume {
    backend: SuiteVolumeBackend;
    storageClassName?: string;
    /** How many suite versions are retained on disk. */
    retention: number;
    /**
     * How many deploy attempts (the seed and migration Jobs) are retained.
     *
     * A second number rather than the one above, because the two are unrelated quantities: a volume is
     * disk on every node, an attempt is one Job (D-471).
     */
    attemptRetention: number;
    /** Opt-in RWX provider the installer generates so `shared` becomes available. */
    rwxProvider?: 'openebs';
    /** The remote manifest the generated RWX storage is built from. */
    rwxManifest?: string;
    /** Where the deployer fetches the suite artifact from. */
    artifact?: ISuiteArtifact;
}

/** What a suite asks for; `auto` lets the installer pick the backend. */
export interface ISuiteVolumeRequest extends Omit<Partial<ISuiteVolume>, 'backend'> {
    backend?: SuiteVolumeBackend | 'auto';
}

/** What the suite asks for on behalf of its own operator (Phase 10). */
export interface ISuiteOperatorRequest {
    replicas?: number;
    /** Overrides the framework image the operator runs from. */
    image?: string;
    /** Seconds between reconcile passes. 0 means the Deployment starts no loop. */
    intervalSeconds?: number;
    /** The address the deployment read API answers on (D-434). */
    ingress?: IOperatorIngress;
}

/**
 * The operator's own address.
 *
 * The operator publishes the deployment read API, one per cluster in the namespace it was installed
 * into — and a suite's portal can never front it, because an Ingress backend has to be a Service in
 * the Ingress's own namespace and a selector is namespace-local (T-254, T-258). So the address is the
 * *installer's* to declare: it sits beside `install` and `operator` in the operator's own config, and
 * a suite (or a CR) never carries one, because the deployment page is the operator's alone (D-434).
 */
export interface IOperatorIngress {
    host: string;
    /** Path prefix the API answers on (default `/`). */
    path?: string;
    /** Certificate for the host; which issuer signs it is the cluster's decision. */
    tls?: {secretName?: string};
    auth?: IPortalAuth;
}

/** The operator as the install tree carries it. */
export interface ISuiteOperator {
    replicas: number;
    image?: string;
    intervalSeconds: number;
    ingress?: IOperatorIngress;
}

/**
 * How this process runs the operator's loop.
 *
 * Absent or zero means no loop: the port then serves the read API and the one-shot `k8s` intent,
 * which is what a developer machine wants and what a UI process wants. The generated operator
 * Deployment turns it on through the environment, because the container's command line belongs to
 * the image (see `operator.ts` for the variable names).
 */
export interface IControllerConfig {
    intervalSeconds?: number;
    /** Where each pass takes its plan from. A CR is what an operator is meant to reconcile. */
    from?: 'registry' | 'cr';
    /** Whether a pass may change anything, or only report the difference it would make. */
    apply?: boolean;
    /**
     * Whether a pass may also remove what the declaration stopped naming.
     *
     * Separate from `apply` because a converge and a removal are different intentions, and the
     * second one cannot be walked back. What it removes is scoped to the suite's namespace, so a
     * generated service in a namespace of its own is reported rather than deleted (D-461).
     */
    prune?: boolean;
    /**
     * Whether the loop follows the CRD with a watch instead of only on the interval.
     *
     * On for a CR pass, which is the default a CR-driven controller wants: waiting out the interval
     * for a change someone just applied is the wrong answer, and the watch re-lists every thirty
     * seconds, so it resyncs as well as reacts. The watch itself runs in `kustomize.watch.run`,
     * because a stream does not survive the deploy port's request path (T-225, T-227); `false` turns
     * it off and leaves the interval as the only trigger.
     */
    watch?: boolean;
}

export interface IDeploymentPlan {
    suite: {
        name: string;
        version?: string;
        namespace: string;
        frameworkImage: string;
        minFrameworkVersion?: string;
        /** Where the artifact's entry point sits inside the mounted volume. */
        entry?: string;
        /** The intents each deployed process runs with. */
        intents?: string[];
        /**
         * The suite keeps state in a database, so the tree owes it a migration step before the
         * processes roll (detected from the loaded registry, not from a config flag).
         */
        database?: boolean;
    };
    profile: DeploymentProfile;
    deployments: IDeployment[];
    services: IService[];
    externalServices: IExternalService[];
    /**
     * The third-party services this deployment brings with it (Phase 15 I).
     *
     * Resolved from the adapter kinds its processes activate and filtered by the suite's own switch
     * (`services.ts`): each entry names a descriptor under `services/` and carries the values its base
     * is given. The alias that keeps a realm's config working — `mysql`, not a host — is published
     * beside the workload when it is generated.
     */
    backingServices: IBackingService[];
    /**
     * What the deployment asked for about those services, as it asked.
     *
     * The request rather than the resolved set, for the reason the portals travel the same way: the
     * operator regenerates the tree from the CR, and a service a deployment switched off has to stay
     * off across that pass — which only a field on the declaration can say.
     */
    backingServiceRequest: IBackingServiceRequest;
    ingresses: IIngress[];
    manifests: Record<string, unknown>[];
    /** Secret generator entries, from the config and from contributions alike. */
    secrets: IGeneratorEntry[];
    /** ConfigMap generator entries for the files a realm serves. */
    assets: IGeneratorEntry[];
    suiteVolume: ISuiteVolume;
    /**
     * The nodes the suite runs on, which is what a `nodeLocal` volume is filled per.
     *
     * Cluster state rather than configuration, and carried here because the tree cannot be written
     * without it: one fill Job per node is one directory per node (D-470). A plan that names none is a
     * plan whose tree would leave every process waiting for a directory nobody fills.
     */
    nodes: string[];
    /** Every published entry point, each resolved to the process behind it, by alias. */
    portal: IResolvedPortalMap;
    /** The realm's own operator: identity, permissions, and its Deployment. */
    operator: ISuiteOperator;
    /** When set, the tree carries the CRD and this suite's CR. */
    crd?: boolean;
    /** True when this plan is the operator's install tree rather than a suite's. */
    install: boolean;
}

export interface IPlanOptions {
    suiteName: string;
    suiteVersion?: string;
    /** The nodes the suite runs on, when the caller can see the cluster (`nodeLocal` needs them). */
    nodes?: string[];
    namespace?: string;
    frameworkImage: string;
    minFrameworkVersion?: string;
    /**
     * Write the operator's own install tree instead of a suite's: the namespace it lives in, its
     * Deployment, its cluster-scoped rights and the CRD. One per cluster, applied once (Phase 15 A).
     */
    install?: boolean;
    /** Where the artifact's entry point sits inside the mounted volume (default
     * `./suite/index.ts`). */
    entry?: string;
    /**
     * The intents a deployed process runs with (default `['release']`). Without one the framework
     * would activate its own defaults — `dev`, `microservice` and `integration` — and every pod would
     * watch files and run integration tests. What a *deployment* may name here is the intents it is
     * configuration for (`release`, `debug`); the intents that describe how a developer runs a
     * realm are dropped by `deploymentIntents` in `generator.ts`, and `release` stays last because the
     * trailing name picks the rc file the tree mounts (D-428).
     */
    intents?: string[];
    profile?: DeploymentProfile;
    /** `group` profile: deployment name → `<realm>.<layer>` selectors. */
    groups?: Record<string, string[]>;
    externalServices?: IExternalServiceMap;
    /**
     * Which third-party services to bring along, and what to override about them (`false` leaves one
     * to an installation of the deployment's own).
     */
    services?: IServiceConfig;
    /** The namespace the generated workloads run in (default `blong-services`). */
    servicesNamespace?: string;
    /** The storage class a generated claim asks for, where the cluster has one to name. */
    storageClassName?: string;
    /** The catalog, when a caller has already read it; the realm's own is loaded otherwise. */
    catalog?: IServiceDescriptor[];
    suiteVolume?: ISuiteVolumeRequest;
    /** Every portal the suite publishes, by alias. Empty is ordinary: a realm-only suite has no UI. */
    portal?: ISuitePortalMap;
    operator?: ISuiteOperatorRequest;
    /** Secret generator entries for the whole suite. */
    secrets?: IGeneratorEntry[];
    /** ConfigMap generator entries for files the suite serves. */
    assets?: IGeneratorEntry[];
    /** Emit the `BlongDeployment` CRD and a CR for this suite (Phase 11). */
    crd?: boolean;
}

/** Layers whose groups never become a process of their own. */
const NON_RUNTIME_LAYERS = new Set(['meta', 'error', 'test', 'api', 'init', 'sim']);

/** Framework realms whose namespaces are plumbing, not application services. */
const INTERNAL_REALMS = new Set(['blong']);

/** Port groups that exist only for tests. */
const INTERNAL_GROUPS = new Set(['testDispatch']);

/**
 * True when a port is an application orchestrator namespace worth a Service.
 *
 * Only a *dispatch* orchestrator owns a namespace another process calls. An
 * adapter that declares a namespace (the Kubernetes adapter's `cluster`, the
 * knex adapter's `db`) is a local handler group, not a service: publishing it
 * would put a Service in the tree for something nothing dials.
 */
const isApplicationPort = (port: IRegistryPort, view: IRegistryView): boolean => {
    const [realm, group] = port.id.split('.');
    if (!realm || !group) return false;
    if (port.type !== 'dispatch') return false;
    if (INTERNAL_REALMS.has(realm) || INTERNAL_GROUPS.has(group)) return false;
    return view.realms.includes(realm);
};

export const DEFAULT_PROFILE: DeploymentProfile = 'realm';
export const DEFAULT_RETENTION = 3;
/** Deploy attempts kept: a step that failed twice and then worked is still a story worth keeping. */
export const DEFAULT_ATTEMPT_RETENTION = 5;

/**
 * Resolve what the suite asked for into what will be generated.
 *
 * `auto` prefers `shared` when an RWX storage is named or an RWX provider is
 * configured to be generated, and otherwise stays on `nodeLocal` — the backend
 * that needs no storage class at all, which is what a bare cluster offers.
 */
export const resolveSuiteVolume = (request?: ISuiteVolumeRequest): ISuiteVolume => {
    const wantsShared = Boolean(request?.storageClassName || request?.rwxProvider);
    const backend =
        !request?.backend || request.backend === 'auto'
            ? wantsShared
                ? 'shared'
                : 'nodeLocal'
            : request.backend;
    return {
        backend,
        // The provider implies its default class, so a suite that only names
        // `rwxProvider: openebs` still gets a claim the cluster can satisfy.
        storageClassName:
            request?.storageClassName ??
            (request?.rwxProvider === 'openebs' ? 'openebs-rwx' : undefined),
        retention: request?.retention ?? DEFAULT_RETENTION,
        attemptRetention: request?.attemptRetention ?? DEFAULT_ATTEMPT_RETENTION,
        rwxProvider: request?.rwxProvider,
        rwxManifest: request?.rwxManifest,
        artifact: request?.artifact,
    };
};

const internalNS = /^subject$|^blong$/;

/** Normalise `string | string[] | undefined` to a list. */
export const namespaceList = (namespace?: string | string[]): string[] =>
    namespace === undefined
        ? []
        : (Array.isArray(namespace) ? namespace : [namespace]).filter(
              namespace => !internalNS.test(namespace),
          );
/**
 * The operator the suite runs.
 *
 * `enabled` defaults to false, and the tree still emits the operator's Deployment when the suite
 * ships a CR: a custom resource with nothing reconciling it is a declaration nobody reads. The
 * identity and the permissions always ship, because they are inert and the alternative is finding
 * them missing in a cluster.
 */
export const resolveSuiteOperator = (request?: ISuiteOperatorRequest): ISuiteOperator => ({
    replicas: request?.replicas ?? 1,
    image: request?.image,
    // An operator that reconciles nothing is not an operator: enabling one without naming an
    // interval would otherwise start a pod whose only behaviour is to exist.
    intervalSeconds: request?.intervalSeconds ?? 60,
    // No ingress unless one is asked for: an Ingress is a DNS record and a certificate somebody has
    // to own, so the installer declares the host rather than the tree inventing one (D-434).
    ingress: request?.ingress,
});

/** Merge plain objects recursively; arrays are concatenated; scalars replace. */
export const deepMerge = (base: unknown, patch: unknown): unknown => {
    if (patch === undefined) return base;
    if (base === undefined) return patch;
    if (Array.isArray(base) || Array.isArray(patch)) {
        const left = Array.isArray(base) ? base : [base];
        const right = Array.isArray(patch) ? patch : [patch];
        return [...left, ...right];
    }
    if (base && patch && typeof base === 'object' && typeof patch === 'object') {
        const result: Record<string, unknown> = {...(base as Record<string, unknown>)};
        for (const [key, value] of Object.entries(patch as Record<string, unknown>)) {
            result[key] = key in result ? deepMerge(result[key], value) : value;
        }
        return result;
    }
    return patch;
};

/** The `activation.k8s` keys, so a port's merged config can be trimmed to them. */
const K8S_KEYS = [
    'k8sReplicas',
    'k8sResources',
    'k8sPorts',
    'k8sIngresses',
    'k8sEnv',
    'k8sManifests',
    'k8sSecrets',
    'k8sAssets',
    'k8sVolumes',
] as const satisfies ReadonlyArray<keyof IComponentK8sConfig>;

const contributionOf = (
    config?: {namespace?: string | string[]} & Partial<IComponentK8sConfig>,
): IComponentK8sConfig | undefined => {
    if (!config) return undefined;
    const picked: Record<string, unknown> = {};
    for (const key of K8S_KEYS) if (config[key] !== undefined) picked[key] = config[key];
    return Object.keys(picked).length ? (picked as IComponentK8sConfig) : undefined;
};

/**
 * Reduce a live registry to a plain view. `watch.describe()` supplies the paths
 * that carry the layer, because the registry itself keeps no layer field.
 */
export const registryView = (registry?: IDescribeCapable): IRegistryView => {
    const described = registry?.describe?.() ?? {};
    const groupCount = new Map((described.groups ?? []).map(g => [g.name, g.handlerCount]));
    const groups: IRegistryGroup[] = (described.folders ?? []).map(folder => {
        const folderName = folder.group.split('.').pop() ?? '';
        const parts = folder.dir.split('/');
        const index = parts.lastIndexOf(folderName);
        return {
            name: folder.group,
            handlerCount: groupCount.get(folder.group) ?? 0,
            layer: index > 0 ? parts[index - 1] : undefined,
            path: folder.dir,
        };
    });
    const ports: IRegistryPort[] = (described.ports ?? []).map(id => {
        const config = registry?.getPort?.(id)?.config;
        // A knex adapter's connection names the schema it expects to exist, and that name is what the
        // generated database service is asked to create (`services.ts`): read here rather than
        // declared again, because the two would disagree the first time a suite renamed a database.
        const connection = (config as {connection?: {database?: unknown}} | undefined)?.connection;
        return {
            id,
            namespace: config?.namespace,
            type: config?.type,
            database: typeof connection?.database === 'string' ? connection.database : undefined,
            k8s: contributionOf(config),
        };
    });
    // A realm's role is its own declaration, read from the config it carries (`realmConfig` below).
    // A port used to be able to state one as well, which is what the planner read while a realm-level
    // surface was missing: it made the role a property of whoever happened to own a port, and a realm
    // that owns none — `core` and `access`, whose handlers live in the shared `srv.db` adapter — could
    // not state it at all (D-433).
    const roles: Record<string, RealmRole> = {};
    for (const [name, config] of Object.entries(described.realmConfig ?? {})) {
        const declared = (config as {k8s?: {k8sRealmRole?: RealmRole}} | undefined)?.k8s
            ?.k8sRealmRole;
        if (declared) roles[name] = declared;
    }
    return {realms: described.realms ?? [], groups, ports, roles};
};

/** The runtime layer of a group, or `undefined` for layers that never run. */
const runtimeLayer = (group: IRegistryGroup): string | undefined =>
    group.layer && !NON_RUNTIME_LAYERS.has(group.layer) ? group.layer : undefined;

const realmOf = (groupName: string): string => groupName.split('.')[0] ?? groupName;

/** `<realm>.<layer>` selectors present in the view, de-duplicated and ordered. */
export const layerSelectors = (view: IRegistryView): string[] => {
    const seen = new Set<string>();
    for (const group of view.groups) {
        const layer = runtimeLayer(group);
        if (layer) seen.add(`${realmOf(group.name)}.${layer}`);
    }
    return [...seen];
};

/**
 * The deployment names for a profile, and the selectors each one carries.
 *
 * The split is the profile's whole meaning, so an unknown name is refused instead of falling
 * through to `monolith`: a CR or a suite config that spells a profile this realm does not know
 * used to deploy a single process and report success, which is the one answer nobody can debug.
 */
const deploymentNames = (
    view: IRegistryView,
    selectors: string[],
    profile: DeploymentProfile,
    options: IPlanOptions,
): Map<string, string[]> => {
    const byName = new Map<string, string[]>();
    const add = (name: string, selectorsForName: string[]): void => {
        byName.set(name, [...(byName.get(name) ?? []), ...selectorsForName]);
    };
    switch (profile) {
        case 'namespace': {
            // The finest split: one process per orchestrator namespace, because a namespace is the
            // unit another process dials — `ResolutionK8s` resolves `rpc-<namespace>` to the
            // Service of that name. A realm that answers in no namespace keeps a process of its
            // own, so the profile decides the split and never which code runs.
            const namespacesOfRealm = new Map<string, string[]>();
            for (const port of view.ports) {
                if (!isApplicationPort(port, view)) continue;
                const realm = realmOf(port.id);
                const names = namespacesOfRealm.get(realm) ?? [];
                for (const name of namespaceList(port.namespace)) {
                    if (!names.includes(name)) names.push(name);
                }
                namespacesOfRealm.set(realm, names);
            }
            for (const selector of selectors) {
                const names = namespacesOfRealm.get(realmOf(selector)) ?? [];
                if (names.length === 0) add(realmOf(selector), [selector]);
                else for (const name of names) add(name, [selector]);
            }
            break;
        }
        case 'realm': {
            for (const selector of selectors) add(realmOf(selector), [selector]);
            break;
        }
        case 'group': {
            for (const [name, list] of Object.entries(options.groups ?? {})) add(name, list);
            break;
        }
        case 'monolith': {
            add(options.suiteName, selectors);
            break;
        }
        default:
            throw new Error(
                `unknown deployment profile "${String(profile)}": ` +
                    'expected namespace, realm, group or monolith',
            );
    }
    return byName;
};

/**
 * Derive the deployment plan from a registry view. Pure: no cluster, no
 * filesystem, no framework — which is what makes it unit-testable.
 */
export const planFromRegistry = (view: IRegistryView, options: IPlanOptions): IDeploymentPlan => {
    const profile = options.profile ?? DEFAULT_PROFILE;
    const namespace = options.namespace ?? options.suiteName;
    // What the deployment brings with it, before anything renders it: the adapter kinds its ports carry
    // decide which services exist, the suite may switch one off, and the databases its connections
    // name are the list a database service is asked to create (`services.ts`).
    const backing = resolveBackingServices(options.catalog ?? loadServiceCatalog(), {
        kinds: [...new Set(view.ports.map(port => port.type))].filter(
            (kind): kind is string => typeof kind === 'string' && kind !== 'dispatch',
        ),
        databases: [...new Set(view.ports.map(port => port.database))].filter(
            (database): database is string => typeof database === 'string',
        ),
        config: options.services,
        namespace: options.servicesNamespace,
        storageClassName: options.storageClassName,
    });
    // What a realm *is* in a deployment decides the split, before any profile splits anything: a
    // `service` realm becomes a process of its own and owns its namespaces, a `companion` is carried
    // by every process and owns none (so it publishes no Service), `both` is carried everywhere *and*
    // owns a process — the only way an in-process library realm can also offer a public API — and
    // `none` is not deployed at all (T-235).
    const roleOf = (realm: string): RealmRole => view.roles[realm] ?? 'service';
    const deployable = (realm: string): boolean =>
        roleOf(realm) === 'service' || roleOf(realm) === 'both';
    const companion = (realm: string): boolean =>
        roleOf(realm) === 'companion' || roleOf(realm) === 'both';
    const selectors = layerSelectors(view).filter(selector => roleOf(realmOf(selector)) !== 'none');
    const companions = selectors.filter(selector => companion(realmOf(selector)));
    const byName = deploymentNames(
        view,
        selectors.filter(selector => deployable(realmOf(selector))),
        profile,
        options,
    );

    const namespacesOf = (realm: string): string[] =>
        view.ports
            .filter(
                port => isApplicationPort(port, view) && (port.id.split('.')[0] ?? '') === realm,
            )
            .flatMap(port => namespaceList(port.namespace));

    const contributionFor = (realm: string): IComponentK8sConfig[] =>
        view.ports
            .filter(
                port => isApplicationPort(port, view) && (port.id.split('.')[0] ?? '') === realm,
            )
            .flatMap(port => (port.k8s ? [port.k8s] : []));

    const deployments: IDeployment[] = [...byName.entries()].map(([name, own]) => {
        // Every process also carries the companions, so a call into `srv.subject` or `core.*`
        // resolves in-process wherever it is made. Deduplicated because a `both` realm is already in
        // its own process's list.
        const carried = [...new Set([...own, ...companions])];
        const realms = [...new Set(carried.map(selector => selector.split('.')[0]))];
        const contributions = realms.flatMap(contributionFor);
        const replicas = contributions
            .map(contribution => contribution.k8sReplicas)
            .filter((value): value is number => typeof value === 'number');
        const resources = contributions.reduce<IDeployment['resources']>(
            (merged, contribution) =>
                deepMerge(merged, contribution.k8sResources) as IDeployment['resources'],
            {
                requests: {...DEFAULT_RESOURCES.requests},
                limits: {...DEFAULT_RESOURCES.limits},
            },
        );
        const ports = contributions.flatMap(contribution => contribution.k8sPorts ?? []);
        const env = contributions.flatMap(contribution => contribution.k8sEnv ?? []);
        return {
            name,
            realms,
            // The selectors this process activates, `realm.layer` pairs: a layer name alone does not
            // say which realm's handler group it is, and two realms have an `orchestrator`.
            layers: carried,
            // What this process can answer for, companions included: the set that decides which
            // calls it serves locally and which it has to send to the owner of a namespace.
            namespaces: [...new Set(realms.flatMap(namespacesOf))],
            replicas: replicas.length ? Math.max(...replicas) : 1,
            resources,
            ...(ports.length ? {ports} : {}),
            ...(env.length ? {env} : {}),
        };
    });

    // Which process is a realm's *own*: the one the profile built from that realm's selectors. Asking
    // instead which deployment happens to include the realm answers a different question, because a
    // companion and a `both` realm are carried by every process — the first match was another realm's
    // process, which is how the `access` Service ended up pointing at the `core` deployment (T-236).
    const dedicated = new Map<string, string>();
    const deploymentForRealm = (realm: string): string | undefined => dedicated.get(realm);
    for (const [name, own] of byName) {
        for (const selector of own) {
            const realm = realmOf(selector);
            if (!dedicated.has(realm)) dedicated.set(realm, name);
        }
    }

    // A portal names the realm whose process serves it, and the two ways of not naming one are
    // refused rather than guessed: a suite split into several processes would get whichever
    // deployment the map happened to yield first — the arbitrary answer the namespace Services were
    // fixed out of (T-236) — and a companion has no process for a portal to land on, which is a
    // realm-role mistake worth hearing about at plan time rather than from a 503 at the Ingress.
    const portal: IResolvedPortalMap = {};
    for (const [name, entry] of Object.entries(options.portal ?? {})) {
        const where = `portal "${name}"`;
        if (entry.realm === undefined) {
            const [only] = deployments;
            if (!only || deployments.length !== 1) {
                throw new Error(
                    `${where} names no realm, and a portal without one needs a suite with exactly ` +
                        `one process: this plan has ${deployments.length}, so name the realm whose ` +
                        'process serves it',
                );
            }
            portal[name] = {...entry, deployment: only.name};
            continue;
        }
        const deployment = deploymentForRealm(entry.realm);
        if (!deployment) {
            throw new Error(
                `${where} names realm "${entry.realm}", which has no process of its own: a ` +
                    'companion is carried by every process and owns none, so a portal has to name ' +
                    'a realm that becomes one',
            );
        }
        portal[name] = {...entry, deployment};
    }

    // One Service per namespace, and the owner is decided from the *namespace* rather than from the
    // port that declares it: a shared orchestrator declares the namespaces of the realms it carries
    // (`server.subject` declares `subject` *and* `access`), so the port's realm is the one that
    // merged the namespace in, not the one whose handlers answer there. A namespace named after a
    // deployable realm belongs to that realm; otherwise the realm that declared it owns it when it
    // is deployable; otherwise it is carried by companions alone, every process can answer it, and
    // it publishes nothing — a Service there would name one of them arbitrarily (T-235).
    const declaredNamespaces = new Map<string, string>();
    for (const port of view.ports) {
        if (!isApplicationPort(port, view)) continue;
        for (const name of namespaceList(port.namespace)) {
            if (!declaredNamespaces.has(name)) declaredNamespaces.set(name, realmOf(port.id));
        }
    }
    const owningRealm = (namespaceName: string): string | undefined => {
        if (
            deployable(namespaceName) &&
            selectors.some(selector => realmOf(selector) === namespaceName)
        ) {
            return namespaceName;
        }
        const declaring = declaredNamespaces.get(namespaceName);
        return declaring && deployable(declaring) ? declaring : undefined;
    };
    const services: IService[] = [...declaredNamespaces.keys()].flatMap(namespaceName => {
        const owner = owningRealm(namespaceName);
        const deployment = owner ? deploymentForRealm(owner) : undefined;
        // No Service for a namespace no process owns. Either every process can answer it (a
        // companion's namespace) or the profile deliberately left the owner out — a `group` map names
        // the deployments it wants, and inventing an owner for the rest was exactly the bug this
        // replaced. A namespace without a Service is still reachable in-process from every process
        // that carries it, which is what the companions guarantee.
        if (!owner || !deployment) return [];
        return [{name: namespaceName, namespace, deployment}];
    });

    const ingresses: IIngress[] = view.ports
        .filter(port => isApplicationPort(port, view))
        .flatMap(port =>
            (port.k8s?.k8sIngresses ?? []).map(ingress => ({
                name: ingress.name,
                namespace,
                host: ingress.host,
                path: ingress.path,
                pathType: ingress.pathType ?? 'Prefix',
                serviceName:
                    ingress.serviceName ??
                    deploymentForRealm(port.id.split('.')[0] ?? '') ??
                    deployments[0]?.name ??
                    '',
                servicePort: ingress.servicePort ?? 8080,
                tls: ingress.tls,
            })),
        );

    const manifests: Record<string, unknown>[] = view.ports
        .filter(port => isApplicationPort(port, view))
        .flatMap(port => port.k8s?.k8sManifests ?? []);
    // What the suite declares first, then what its realms add: a suite can own a secret and a realm
    // can bring one beside it without either knowing about the other.
    const fromComponents = <T>(pick: (config: IComponentK8sConfig) => T[] | undefined): T[] =>
        view.ports
            .filter(port => isApplicationPort(port, view))
            .flatMap(port => (port.k8s ? pick(port.k8s) : undefined) ?? []);
    const secrets: IGeneratorEntry[] = [
        ...(options.secrets ?? []),
        ...fromComponents(config => config.k8sSecrets),
    ];
    const assets: IGeneratorEntry[] = [
        ...(options.assets ?? []),
        ...fromComponents(config => config.k8sAssets),
    ];

    return {
        suite: {
            name: options.suiteName,
            version: options.suiteVersion,
            namespace,
            frameworkImage: options.frameworkImage,
            minFrameworkVersion: options.minFrameworkVersion,
            entry: options.entry,
            intents: options.intents,
            // A realm that keeps state attaches a `*.db` port; the tree owes such a suite a
            // migration step, and reading it from the registry beats a config flag that can be
            // wrong about the suite it describes.
            database: view.ports.some(port => port.id.endsWith('.db')),
        },
        profile,
        nodes: options.nodes ?? [],
        deployments,
        services,
        // Declared by alias, resolved to the name the alias is: one shape reaches the generator,
        // whichever of the suite's own config or the tenant's CR carried the entry.
        externalServices: resolveExternalServices(options.externalServices),
        backingServices: backing.services,
        backingServiceRequest: {
            ...(options.services ? {services: options.services} : {}),
            ...(options.servicesNamespace ? {servicesNamespace: options.servicesNamespace} : {}),
            ...(options.storageClassName ? {storageClassName: options.storageClassName} : {}),
        },
        ingresses,
        manifests,
        secrets,
        assets,
        suiteVolume: resolveSuiteVolume(options.suiteVolume),
        portal,
        operator: resolveSuiteOperator(options.operator),
        crd: options.crd,
        install: options.install ?? false,
    };
};

/** The realm-level config the planner reads (declared in the layer/`server.ts`). */
export interface IPlanConfig {
    suite?: {
        name?: string;
        version?: string;
        namespace?: string;
        frameworkImage?: string;
        minFrameworkVersion?: string;
        /** Where the artifact's entry point sits inside the mounted volume. */
        entry?: string;
        /** The intents each deployed process runs with. */
        intents?: string[];
    };
    profile?: DeploymentProfile;
    /** `group` profile: deployment name → `<realm>.<layer>` selectors. */
    groups?: Record<string, string[]>;
    externalServices?: IExternalServiceMap;
    /** Which third-party services to bring along, and what to override about them. */
    services?: IServiceConfig;
    /** The namespace the generated workloads run in (default `blong-services`). */
    servicesNamespace?: string;
    /** The storage class a generated claim asks for, where the cluster has one to name. */
    storageClassName?: string;
    suiteVolume?: ISuiteVolumeRequest;
    /** Every portal this suite publishes, by alias, named by address rather than by content. */
    portal?: ISuitePortalMap;
    /** The realm's own operator: its Deployment and the loop it runs. */
    operator?: ISuiteOperatorRequest;
    /** How this process runs the operator's loop; the environment can turn it on instead. */
    controller?: IControllerConfig;
    /** Secret generator entries for the whole suite. */
    secrets?: IGeneratorEntry[];
    /** ConfigMap generator entries for files the suite serves. */
    assets?: IGeneratorEntry[];
    /** Emit the `BlongDeployment` CRD and a CR for this suite (Phase 11). */
    crd?: boolean;
    /** Write the operator's install tree rather than a suite's (see {@link IPlanOptions.install}). */
    install?: boolean;
    /** Directory the generated tree is written to (default `system/kustomize`). */
    outputDir?: string;
    /**
     * How the tree is written: one directory of manifests (`flat`, the default), or a committed `base/`
     * beside a `local/` overlay that carries the artifact and the node names.
     *
     * The operator asks for `flat`, because it reads the tree back and compares objects with the cluster;
     * a repository tree is generated with `split` and applied with `kubectl apply -k …/local` (D-475).
     */
    layout?: 'flat' | 'split';
    /**
     * A `BlongDeployment` spec, as a JSON file, when this process generates for a CR rather than for
     * itself: the operator loads the target suite's artifact and has to tell it what to plan (T-234).
     */
    specFile?: string;
    /**
     * Where fetched suite artifacts are cached, when this process runs an operator: one directory per
     * suite and version (default `$HOME/.blong/artifacts`, a mounted volume in a cluster).
     */
    artifactCacheDir?: string;
    /** Where generated trees are written for a CR, one directory per suite (default `$HOME/.blong/generations`). */
    generationRoot?: string;
    /** Set by the `k8s` activation block; a serving process never generates. */
    generateManifests?: boolean;
}

const DEFAULT_FRAMEWORK_IMAGE = 'ghcr.io/feasibleone/blong-gogo';

/**
 * A `BlongDeployment`'s spec, as the CRD declares it (Phase 11).
 *
 * It carries plan *inputs*, not the plan: which suite, from which image, at which granularity,
 * with which volume. The processes and Services are still derived from the registry the reconciling
 * process loaded, because those follow from what is actually running. That split is what lets a CR
 * be a declaration a human writes while the tree stays a fact the registry produces.
 */
export interface IBlongDeploymentSpec {
    version?: string;
    frameworkImage?: string;
    minFrameworkVersion?: string;
    profile?: DeploymentProfile;
    /** Where the artifact's entry point sits inside the mounted volume. */
    entry?: string;
    /** The intents a deployed process runs with. */
    intents?: string[];
    suiteVolume?: ISuiteVolumeRequest;
    externalServices?: IExternalServiceMap;
    /** Which third-party services the tenant wants generated, and which it runs itself. */
    services?: IServiceConfig;
    /** The namespace those services run in, when the tenant wants one of its own. */
    servicesNamespace?: string;
    /** The class their claims ask for, when the tenant names one. */
    storageClassName?: string;
    /** The portals this suite publishes; a tenant may name their `host` and nothing else. */
    portal?: ISuitePortalMap;
}

/**
 * The plan options a CR asks for — only the fields it actually names.
 *
 * A field the CR omits falls back to the realm's own config rather than to a default, so a CR that
 * says nothing about the volume does not silently overrule a suite that configured one. The suite's
 * name is deliberately not one of them: it is the CR's own `metadata.name`, which the operator has
 * without asking (Q4), so there is no field to keep in step with the object it lives on.
 */
export const planOptionsFromSpec = (spec: IBlongDeploymentSpec = {}): Partial<IPlanOptions> => {
    const options: Partial<IPlanOptions> = {};
    if (spec.version !== undefined) options.suiteVersion = spec.version;
    if (spec.frameworkImage !== undefined) options.frameworkImage = spec.frameworkImage;
    if (spec.minFrameworkVersion !== undefined) {
        options.minFrameworkVersion = spec.minFrameworkVersion;
    }
    if (spec.profile !== undefined) options.profile = spec.profile;
    if (spec.entry !== undefined) options.entry = spec.entry;
    if (spec.intents !== undefined) options.intents = spec.intents;
    if (spec.externalServices !== undefined) options.externalServices = spec.externalServices;
    if (spec.services !== undefined) options.services = spec.services;
    if (spec.servicesNamespace !== undefined) options.servicesNamespace = spec.servicesNamespace;
    if (spec.storageClassName !== undefined) options.storageClassName = spec.storageClassName;
    if (spec.suiteVolume !== undefined) options.suiteVolume = spec.suiteVolume;
    if (spec.portal !== undefined) options.portal = spec.portal;
    return options;
};

/** The plan options a realm's merged config asks for. */
export const planOptionsOf = (config: IPlanConfig | undefined): IPlanOptions => ({
    suiteName: config?.suite?.name ?? 'blong-suite',
    suiteVersion: config?.suite?.version,
    namespace: config?.suite?.namespace,
    frameworkImage: config?.suite?.frameworkImage ?? DEFAULT_FRAMEWORK_IMAGE,
    minFrameworkVersion: config?.suite?.minFrameworkVersion,
    install: config?.install,
    entry: config?.suite?.entry,
    intents: config?.suite?.intents,
    profile: config?.profile,
    groups: config?.groups,
    externalServices: config?.externalServices,
    services: config?.services,
    servicesNamespace: config?.servicesNamespace,
    storageClassName: config?.storageClassName,
    suiteVolume: config?.suiteVolume,
    portal: config?.portal,
    operator: config?.operator,
    secrets: config?.secrets,
    assets: config?.assets,
    crd: config?.crd,
});

/** `planFromRegistry` over a live registry and the merged realm config. */
export const planFor = (
    config: IPlanConfig | undefined,
    registry?: IDescribeCapable,
    spec?: Partial<IPlanOptions>,
    /** The cluster's nodes, which a `nodeLocal` tree cannot be written without (D-470). */
    nodes?: string[],
): IDeploymentPlan =>
    // A spec wins only where it names a field: a CR that mentions its own name must not quietly undo a
    // volume the suite configured, which is the rule `planOptionsFromSpec` already keeps field by
    // field (T-234).
    planFromRegistry(registryView(registry), {
        ...planOptionsOf(config),
        ...spec,
        ...(nodes?.length ? {nodes} : {}),
    });

/**
 * The node names in a list the cluster adapter answered with.
 *
 * A pure mapping, because the three callers reach the adapter three ways — a handler's own proxy, a
 * port's dispatch, a realm's `local` registry — and each unwraps its own answer. What matters is here:
 * a node without a name is not a node, and a realm loaded without a cluster answers with none, so a
 * plan can say what it is missing rather than leaving every process waiting for a directory nobody
 * fills (D-470).
 */
export const clusterNodeNames = (listed: {items?: unknown[]} | undefined): string[] =>
    (listed?.items ?? [])
        .map(item => (item as {metadata?: {name?: string}})?.metadata?.name)
        .filter((name): name is string => typeof name === 'string');
