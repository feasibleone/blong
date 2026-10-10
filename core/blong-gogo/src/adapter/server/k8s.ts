// cspell:ignore subjectaccessreview subjectaccessreviews subresource tokenreview selfsubjectaccessreview tokenreviews selfsubjectaccessreviews
import {adapter, type Errors, type IErrorMap, type IMeta} from '@feasibleone/blong/types';
import * as k8s from '@kubernetes/client-node';

export interface IConfig {
    k8s: {
        kubeconfig?: string;
        context?: string;
        cluster?: {
            server: string;
            skipTLSVerify?: boolean;
            caData?: string;
        };
        user?: {
            token?: string;
            username?: string;
            password?: string;
            certData?: string;
            keyData?: string;
        };
        namespace?: string;
    };
    context: {
        coreV1Api?: k8s.CoreV1Api;
        appsV1Api?: k8s.AppsV1Api;
        batchV1Api?: k8s.BatchV1Api;
        networkingV1Api?: k8s.NetworkingV1Api;
        rbacV1Api?: k8s.RbacAuthorizationV1Api;
        authV1Api?: k8s.AuthenticationV1Api;
        authzV1Api?: k8s.AuthorizationV1Api;
        customObjectsApi?: k8s.CustomObjectsApi;
        watcher?: k8s.Watch;
    };
}

const errorMap: IErrorMap = {
    'k8s.generic': 'Kubernetes Error',
    // The API's own description, kept: "Kubernetes Error" alone sends a reader to the client
    // library to guess at what the request got wrong.
    'k8s.failed': 'Kubernetes API error: {message} (status {status})',
    'k8s.invalid': 'Invalid Kubernetes Operation',
    // The method it wanted, because the alternative is a reader opening the client library to
    // find out which spelling a kind or a subresource needed.
    'k8s.noMethod': 'The Kubernetes client has no method {method} for this request',
    'k8s.notFound': 'Kubernetes Resource Not Found',
    'k8s.exists': 'Kubernetes Resource Already Exists',
    'k8s.forbidden': 'Kubernetes Access Forbidden',
    'k8s.unauthorized': 'Kubernetes Unauthorized',
    'k8s.missingKey': 'Missing key value for {key}',
    'k8s.missingResource': 'Missing resource type or name',
    'k8s.invalidManifest': 'Invalid Kubernetes manifest',
};

let _errors: Errors<typeof errorMap>;

/**
 * A resource type with its separators removed, as the tables below spell their keys.
 *
 * A method name may carry the words of a compound kind apart (`persistent_volume_claim`), so every
 * lookup goes through the glued spelling the tables hold. The words make the kind; the separator
 * only says where they are.
 */
const gluedType = (resourceType: string): string => resourceType.replace(/[-_]/g, '').toLowerCase();

/**
 * The client's own spelling of a resource type.
 *
 * The generated client capitalises every word — `readNamespacedPersistentVolumeClaim`,
 * `createNamespacedDaemonSet`, `createTokenReview` — so joining the words a method name carries
 * apart is exactly its spelling. A Blong method name is three parts (`subject.object.predicate`), so
 * the middle one cannot be written as several words: it carries them with a separator
 * (`cluster.persistent_volume_claim.apply`), and this is where they are joined. A compound kind
 * written as one lump cannot be recovered — `persistentvolumeclaim` is read as the capitalised lump
 * the client has no method for, which is why `clusterPersistentVolumeClaimApply` used to fail
 * (`cluster.persistent.volumeClaimApply` names no API; F-379).
 */
export const kindOfResource = (resourceType: string): string =>
    resourceType
        .split(/[-_]/)
        .filter(Boolean)
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join('');

/**
 * The group and version a resource type is read through.
 *
 * Mirrors the switch that picks the client (`getApiForResource`) on purpose: that switch chooses an
 * *object* to call, and this is the string the API server puts in each item's `apiVersion`. They are
 * two spellings of one fact, and the day they disagree is the day a list answer's identity is wrong
 * in a way nothing checks — so if they are ever merged, this is the half to keep.
 *
 * Keyed by the canonical resource type — the one `getResourceType` answers with, separators and all.
 */
const API_OF_RESOURCE: Record<string, string> = {
    pod: 'v1',
    service: 'v1',
    config_map: 'v1',
    secret: 'v1',
    namespace: 'v1',
    node: 'v1',
    persistent_volume: 'v1',
    persistent_volume_claim: 'v1',
    deployment: 'apps/v1',
    daemon_set: 'apps/v1',
    stateful_set: 'apps/v1',
    replica_set: 'apps/v1',
    job: 'batch/v1',
    cron_job: 'batch/v1',
    ingress: 'networking.k8s.io/v1',
    network_policy: 'networking.k8s.io/v1',
    role: 'rbac.authorization.k8s.io/v1',
    role_binding: 'rbac.authorization.k8s.io/v1',
    cluster_role: 'rbac.authorization.k8s.io/v1',
    cluster_role_binding: 'rbac.authorization.k8s.io/v1',
    token_review: 'authentication.k8s.io/v1',
    subject_access_review: 'authorization.k8s.io/v1',
    self_subject_access_review: 'authorization.k8s.io/v1',
};

/**
 * The HTTP status an API failure carries.
 *
 * Three spellings, because the client reports it differently per call path and version: the
 * generated `ApiException` this client throws carries `{code, body, headers}`, a transport-level
 * failure carries `response.statusCode`, and the typed errors this adapter raises itself carry
 * neither. Reading only `response.statusCode` — which is what the mapping below used to do — matched
 * nothing at all, so every 404, 401, 403 and 409 reached a caller as `k8s.failed` with `status:
 * "none"`, and an apply that could not tell "absent" from "unreadable" created an object that was
 * already there (F-402).
 */
const statusOf = (error: unknown): number | undefined => {
    const candidate = error as
        | {code?: unknown; statusCode?: unknown; response?: {statusCode?: unknown}}
        | undefined;
    const code = candidate?.code ?? candidate?.statusCode ?? candidate?.response?.statusCode;
    return typeof code === 'number' ? code : undefined;
};

/** The API server's own message, when the failure carries one. */
const apiMessageOf = (error: unknown): string | undefined => {
    const candidate = error as {body?: unknown; response?: {body?: {message?: unknown}}};
    const direct = candidate?.response?.body?.message;
    if (typeof direct === 'string') return direct;
    // The generated client reports the API server's status body as a JSON string, and that text is
    // where the reason lives ("jobs.batch \"x\" already exists"), while `String(error)` keeps the
    // headers around it.
    const body = candidate?.body;
    if (typeof body !== 'string') return undefined;
    try {
        const parsed = JSON.parse(body) as {message?: unknown};
        return typeof parsed?.message === 'string' ? parsed.message : undefined;
    } catch {
        return undefined;
    }
};

/**
 * True when a read failed because the object is not there.
 *
 * Both spellings are recognised: the status the client reports, and the typed error this adapter
 * maps it to (`k8s.notFound`), because a caller sees the second one and only the first is available
 * inside the adapter's own try blocks.
 */
export const isAbsent = (error: unknown): boolean =>
    statusOf(error) === 404 || (error as {type?: string} | undefined)?.type === 'k8s.notFound';

/** True when a create failed because the object is already there. */
export const isAlreadyThere = (error: unknown): boolean =>
    statusOf(error) === 409 || (error as {type?: string} | undefined)?.type === 'k8s.exists';

/**
 * Put each listed item's identity back.
 *
 * The API server answers `{apiVersion, kind}` on every item of a list, and the generated client's
 * typed serializer keeps only `metadata`, `spec` and `status` — so a list reaches its caller
 * type-blind, and every consumer has to know the type from its own request. The cost is visible in
 * this repository: a reconcile diff compared keys it could not build and read eighteen objects as
 * eighteen creations beside eighteen deletions (T-226, T-228). The adapter knows the type from the
 * request it just made, so it can say so, and a custom resource is left alone because the kind is not
 * part of that request — the group, version and plural are, and none of them is the kind.
 */
export const withItemIdentity = (answer: unknown, resourceType: string): unknown => {
    const apiVersion = API_OF_RESOURCE[resourceType];
    const kind = kindOfResource(resourceType);
    const list = answer as {items?: Array<Record<string, unknown>>} | undefined;
    if (!list?.items?.length) return answer;
    return {
        ...list,
        items: list.items.map(item => ({
            ...(item.apiVersion === undefined && apiVersion ? {apiVersion} : {}),
            ...(item.kind === undefined ? {kind} : {}),
            ...item,
        })),
    };
};

/**
 * The body of an update: what the manifest asks for, plus the fields the server
owns and a manifest cannot express.
 *
 * `apply` reads the object before it writes it, and that read is the only place
those
 * fields are visible. A `spec` key the manifest does not name is either absent
because nobody
 * asked for it — the server defaulted it — or because the server *assigned* it, and
a replace that
 * omits it asks the API to clear it. For most fields that is allowed and lands
back on the same
 * default, which is why a blind replace passes unnoticed; for the immutable ones
it is refused, and
 * the object can then never be applied again. A bound `PersistentVolumeClaim` is
the case that found
 * this in the kustomize e2e: its `volumeName` is assigned when the claim binds
and its
 * `storageClassName` is defaulted at creation, the manifest names neither, and
every pass after the
 * first was refused with `spec is immutable after creation` (status 422) — the
release never
 * reported Ready over two fields the tree had no opinion about.
 *
 * The merge stops at the first level under `spec` on purpose. That is where the
server-owned fields
 * live (`volumeName`, `storageClassName`, a Service's `clusterIP`), while
everything the manifest
 * does declare belongs to it completely: a pod template, an env list or a rule
list is the
 * manifest's whole, so a field dropped from the tree still disappears.
 */
export const withServerFields = (live: unknown, desired: unknown): unknown => {
    const current = (live as {spec?: object} | undefined)?.spec;
    const wanted = (desired as {spec?: object} | undefined)?.spec;
    if (!current || !wanted) return desired;
    return {...(desired as object), spec: {...current, ...wanted}};
};

/**
 * Commander explorer categories for namespaced resources. Each category groups
 * the resource types the adapter can list (`{ns}.<resource>.find`). The
 * category / resource levels are synthetic navigation (no cluster calls).
 */
const CATEGORIES: Array<{
    name: string;
    label: string;
    resources: Array<{type: string; label: string}>;
}> = [
    {
        name: 'workloads',
        label: 'Workloads',
        resources: [
            {type: 'deployment', label: 'Deployments'},
            {type: 'replica_set', label: 'ReplicaSets'},
            {type: 'daemon_set', label: 'DaemonSets'},
            {type: 'stateful_set', label: 'StatefulSets'},
            {type: 'pod', label: 'Pods'},
        ],
    },
    {
        name: 'networking',
        label: 'Networking',
        resources: [
            {type: 'service', label: 'Services'},
            {type: 'ingress', label: 'Ingresses'},
            {type: 'network_policy', label: 'NetworkPolicies'},
        ],
    },
    {
        name: 'storage',
        label: 'Storage',
        resources: [
            {type: 'persistent_volume', label: 'PersistentVolumes'},
            {type: 'persistent_volume_claim', label: 'PersistentVolumeClaims'},
            {type: 'storageclass', label: 'StorageClasses'},
        ],
    },
    {
        name: 'configuration',
        label: 'Configuration',
        resources: [
            {type: 'config_map', label: 'ConfigMaps'},
            {type: 'secret', label: 'Secrets'},
        ],
    },
];

export default adapter<IConfig>(({utError}) => {
    _errors ||= utError.register(errorMap);

    return {
        activation: {
            default: {
                type: 'k8s',
            },
        },
        async start() {
            const kc = new k8s.KubeConfig();
            const k8sConfig = this.config.k8s || {};
            // Load kubeconfig based on configuration.
            //
            // A path the process cannot read is an absence rather than a mistake: a run that only turns a
            // plan into manifests — a base generated in dev or CI — never reaches the cluster, and the job
            // that generates one has no kubeconfig to point at. Skipping the load leaves the clients
            // without a server, which is what a call would then report; a file that is there but is not a
            // configuration still stops the process, because that is a mistake (T-297).
            try {
                if (k8sConfig.kubeconfig) {
                    kc.loadFromFile(k8sConfig.kubeconfig);
                } else if (k8sConfig.cluster && k8sConfig.user) {
                    // Manual configuration
                    kc.loadFromOptions({
                        clusters: [
                            {
                                name: 'cluster',
                                server: k8sConfig.cluster.server,
                                skipTLSVerify: k8sConfig.cluster.skipTLSVerify,
                                caData: k8sConfig.cluster.caData,
                            },
                        ],
                        users: [
                            {
                                name: 'user',
                                token: k8sConfig.user.token,
                                username: k8sConfig.user.username,
                                password: k8sConfig.user.password,
                                certData: k8sConfig.user.certData,
                                keyData: k8sConfig.user.keyData,
                            },
                        ],
                        contexts: [
                            {
                                name: 'context',
                                cluster: 'cluster',
                                user: 'user',
                                namespace: k8sConfig.namespace,
                            },
                        ],
                        currentContext: 'context',
                    });
                } else {
                    // Try default locations
                    kc.loadFromDefault();
                }
            } catch (error) {
                if ((error as {code?: string}).code !== 'ENOENT') throw error;
            }

            // Set context if specified
            if (k8sConfig.context) {
                kc.setCurrentContext(k8sConfig.context);
            }

            // Initialize API clients — unless the configuration named nothing usable, which is the one case
            // `start` tolerates: the client library raises `No active cluster!` for an empty configuration,
            // and a run that only turns a plan into manifests (the base a CI job generates) never calls the
            // cluster. The context is left empty, exactly as it is after `stop`, and a call that does need a
            // cluster fails where it is made rather than refusing to start (T-297).
            let clients: IConfig['context'] = {};
            try {
                clients = {
                    coreV1Api: kc.makeApiClient(k8s.CoreV1Api),
                    appsV1Api: kc.makeApiClient(k8s.AppsV1Api),
                    batchV1Api: kc.makeApiClient(k8s.BatchV1Api),
                    networkingV1Api: kc.makeApiClient(k8s.NetworkingV1Api),
                    rbacV1Api: kc.makeApiClient(k8s.RbacAuthorizationV1Api),
                    authV1Api: kc.makeApiClient(k8s.AuthenticationV1Api),
                    authzV1Api: kc.makeApiClient(k8s.AuthorizationV1Api),
                    customObjectsApi: kc.makeApiClient(k8s.CustomObjectsApi),
                    watcher: new k8s.Watch(kc),
                };
            } catch (error) {
                if (/No active cluster/.test((error as Error).message) === false) throw error;
            }
            this.config.context = clients;

            super.connect();
            return super.start();
        },
        async stop(...params: unknown[]) {
            let result;
            try {
                // No specific cleanup needed for k8s clients
            } finally {
                this.config.context = {};
                result = await super.stop(...params);
            }
            return result;
        },
        async exec(
            params:
                | ({
                      namespace?: string;
                      name?: string;
                      manifest?: object;
                      body?: object;
                      labels?: Record<string, string>;
                      fieldSelector?: string;
                      labelSelector?: string;
                      resourceVersion?: string;
                      watch?: boolean;
                      limit?: number;
                      timeout?: number;
                      continue?: string;
                      onEvent?: (event: {type: string; object: unknown}) => unknown;
                      onWatch?: (watch: {existing: unknown}) => void;
                  } & Record<string, unknown>)
                | unknown[],
            $meta: IMeta,
        ) {
            const {method} = $meta;
            const [, _resourceType, operation] = method!.split('.');
            const namespace =
                (!Array.isArray(params) && params.namespace) ||
                this.config.k8s.namespace ||
                'default';

            // Determine which API to use based on resource type
            const getApiForResource = (
                resource: string,
            ):
                | k8s.CoreV1Api
                | k8s.AppsV1Api
                | k8s.BatchV1Api
                | k8s.NetworkingV1Api
                | k8s.RbacAuthorizationV1Api
                | k8s.AuthenticationV1Api
                | k8s.AuthorizationV1Api => {
                switch (gluedType(resource)) {
                    case 'pod':
                    case 'service':
                    case 'configmap':
                    case 'secret':
                    case 'namespace':
                    case 'node':
                    case 'persistentvolume':
                    case 'persistentvolumeclaim':
                        return this.config.context.coreV1Api!;
                    case 'deployment':
                    case 'replicaset':
                    case 'daemonset':
                    case 'statefulset':
                        return this.config.context.appsV1Api!;
                    case 'job':
                    case 'cronjob':
                        return this.config.context.batchV1Api!;
                    case 'ingress':
                    case 'networkpolicy':
                        return this.config.context.networkingV1Api!;
                    case 'role':
                    case 'rolebinding':
                    case 'clusterrole':
                    case 'clusterrolebinding':
                        return this.config.context.rbacV1Api!;
                    // Whose token is this, and may it do this? The two questions the cluster
                    // answers on a caller's behalf, and the only two calls here that are about
                    // identity rather than objects.
                    case 'tokenreview':
                        return this.config.context.authV1Api!;
                    case 'subjectaccessreview':
                    case 'selfsubjectaccessreview':
                        return this.config.context.authzV1Api!;
                    default:
                        return this.config.context.coreV1Api!;
                }
            };
            /**
             * The canonical spelling of a resource type: the words of the kind, with separators.
             *
             * A caller may send the singular or the plural and either separator; the canonical form is
             * what the tables above are keyed by and what `kindOfResource` turns into the client's own
             * spelling (`persistent_volume_claim` → `PersistentVolumeClaim`).
             */
            const RESOURCE_NAME: Record<string, string> = {
                pod: 'pod',
                pods: 'pod',
                service: 'service',
                services: 'service',
                configmap: 'config_map',
                configmaps: 'config_map',
                secret: 'secret',
                secrets: 'secret',
                namespace: 'namespace',
                namespaces: 'namespace',
                node: 'node',
                nodes: 'node',
                persistentvolume: 'persistent_volume',
                persistentvolumes: 'persistent_volume',
                persistentvolumeclaim: 'persistent_volume_claim',
                persistentvolumeclaims: 'persistent_volume_claim',
                deployment: 'deployment',
                deployments: 'deployment',
                replicaset: 'replica_set',
                replicasets: 'replica_set',
                daemonset: 'daemon_set',
                daemonsets: 'daemon_set',
                statefulset: 'stateful_set',
                statefulsets: 'stateful_set',
                job: 'job',
                jobs: 'job',
                cronjob: 'cron_job',
                cronjobs: 'cron_job',
                ingress: 'ingress',
                ingresses: 'ingress',
                networkpolicy: 'network_policy',
                networkpolicies: 'network_policy',
                role: 'role',
                roles: 'role',
                rolebinding: 'role_binding',
                rolebindings: 'role_binding',
                clusterrole: 'cluster_role',
                clusterroles: 'cluster_role',
                clusterrolebinding: 'cluster_role_binding',
                clusterrolebindings: 'cluster_role_binding',
                tokenreview: 'token_review',
                tokenreviews: 'token_review',
                subjectaccessreview: 'subject_access_review',
                subjectaccessreviews: 'subject_access_review',
                selfsubjectaccessreview: 'self_subject_access_review',
                selfsubjectaccessreviews: 'self_subject_access_review',
            };

            const getResourceType = (resource: string): string =>
                RESOURCE_NAME[gluedType(resource)] ?? gluedType(resource);

            const resourceType = getResourceType(_resourceType);

            // Check if this is a custom resource request (resourceType will be 'custom')
            const isCustomResource = resourceType === 'custom' && !Array.isArray(params);

            // A subresource is a path of its own on the API, not a field of the request: a CRD's
            // status is written through `patchNamespacedCustomObjectStatus`, and a patch to the
            // object's own path cannot change it at all. Named here so `getMethodName` can build
            // the method, and absent on every ordinary request.
            const subresource =
                !Array.isArray(params) && typeof params.subresource === 'string'
                    ? params.subresource
                    : undefined;

            // Validate custom resource params
            if (isCustomResource) {
                if (!params.group || !params.version || !params.plural) {
                    throw this.error(
                        _errors['k8s.missingKey']({
                            key: 'group, version, and plural for custom resources',
                        }),
                        $meta,
                    );
                }
            }

            // Select API and build method name based on resource type
            const api = isCustomResource
                ? this.config.context.customObjectsApi
                : getApiForResource(resourceType);
            const CLUSTER_SCOPED_RESOURCES = new Set([
                'namespace',
                'node',
                'persistent_volume',
                'cluster_role',
                'cluster_role_binding',
                'storageclass',
                'priorityclass',
                'ingressclass',
                // Identity objects have no namespace to be scoped to: a TokenReview is about
                // whoever holds the token, not about where they are.
                'token_review',
                'subject_access_review',
                'self_subject_access_review',
            ]);
            const isNamespaced = isCustomResource
                ? !Array.isArray(params) && params.namespaced !== false
                : !!namespace && !CLUSTER_SCOPED_RESOURCES.has(resourceType);

            // Helper to build method name
            const getMethodName = (verb: string, sub?: string): string => {
                const suffix = sub ? sub.charAt(0).toUpperCase() + sub.slice(1) : '';
                if (isCustomResource) {
                    return `${verb}${isNamespaced ? 'Namespaced' : 'Cluster'}CustomObject${suffix}`;
                }
                const prefix = isNamespaced ? 'Namespaced' : '';
                // The words the request carried apart, joined the way the client spells them.
                const resource = kindOfResource(resourceType);
                return `${verb}${prefix}${resource}${suffix}`;
            };

            // Helper to build options for API calls
            const buildOptions = (
                baseOptions: Record<string, unknown> = {},
            ): Record<string, unknown> => {
                if (isCustomResource && !Array.isArray(params)) {
                    const opts: Record<string, unknown> = {
                        group: params.group,
                        version: params.version,
                        plural: params.plural,
                        ...baseOptions,
                    };
                    if (isNamespaced) opts.namespace = namespace;
                    return opts;
                }
                const opts = {...baseOptions};
                if (isNamespaced) opts.namespace = namespace;
                return opts;
            };

            // Helper to call API methods with error handling
            const callApi = async (
                verb: string,
                options: Record<string, unknown> = {},
                sub?: string,
            ): Promise<unknown> => {
                const methodName = getMethodName(verb, sub);
                const apiRecord = api as unknown as Record<string, unknown>;
                if (typeof apiRecord[methodName] === 'function') {
                    return await (apiRecord[methodName] as (opts: unknown) => Promise<unknown>)(
                        buildOptions(options),
                    );
                }
                throw this.error(_errors['k8s.noMethod']({method: methodName}), $meta);
            };

            try {
                // Commander explorer navigation levels (synthetic, no cluster calls):
                //   `{ns}.category.list`  → the resource categories
                //   `{ns}.resource.list`  → the resource types within a category
                if (_resourceType === 'category' && operation === 'list') {
                    const ns =
                        (!Array.isArray(params) && params.namespace) ||
                        this.config.k8s.namespace ||
                        'default';
                    return {
                        items: CATEGORIES.map(c => ({
                            category: c.name,
                            label: c.label,
                            namespace: ns,
                        })),
                    };
                }
                if (_resourceType === 'resource' && operation === 'list') {
                    const category = !Array.isArray(params)
                        ? (params.category as string | undefined)
                        : undefined;
                    const ns =
                        (!Array.isArray(params) && params.namespace) ||
                        this.config.k8s.namespace ||
                        'default';
                    const cat = CATEGORIES.find(c => c.name === category);
                    const resources = cat?.resources ?? [];
                    return {
                        items: resources.map(r => ({
                            resourceType: r.type,
                            label: r.label,
                            namespace: ns,
                        })),
                    };
                }
                switch (operation) {
                    case 'get': {
                        // Get single resource
                        if (Array.isArray(params)) {
                            throw this.error(_errors['k8s.invalid'](), $meta);
                        }
                        const {name} = params;
                        if (!name) {
                            throw this.error(_errors['k8s.missingKey']({key: 'name'}), $meta);
                        }

                        return await callApi(
                            isCustomResource ? 'get' : 'read',
                            {name},
                            subresource,
                        );
                    }
                    case 'list':
                    case 'find': {
                        // List resources
                        if (Array.isArray(params)) {
                            throw this.error(_errors['k8s.invalid'](), $meta);
                        }
                        const {
                            labelSelector,
                            fieldSelector,
                            limit,
                            continue: continueToken,
                        } = params;

                        return withItemIdentity(
                            await callApi('list', {
                                ...(labelSelector && {labelSelector}),
                                ...(fieldSelector && {fieldSelector}),
                                ...(limit && {limit}),
                                ...(continueToken && {continue: continueToken}),
                            }),
                            resourceType,
                        );
                    }
                    case 'log': {
                        // Read pod container logs (`{ns}.pod.log`)
                        if (Array.isArray(params)) {
                            throw this.error(_errors['k8s.invalid'](), $meta);
                        }
                        if (resourceType !== 'pod') {
                            throw this.error(_errors['k8s.invalid'](), $meta);
                        }
                        const {name, container, tailLines, sinceSeconds, follow = false} = params;
                        if (!name) {
                            throw this.error(_errors['k8s.missingKey']({key: 'name'}), $meta);
                        }
                        const result = await this.config.context.coreV1Api!.readNamespacedPodLog({
                            name: name as string,
                            namespace,
                            container: container as string | undefined,
                            follow: follow as boolean,
                            tailLines: tailLines as number | undefined,
                            sinceSeconds: sinceSeconds as number | undefined,
                        });
                        return {logs: result};
                    }
                    case 'create':
                    case 'add': {
                        // Create resource
                        if (Array.isArray(params)) {
                            throw this.error(_errors['k8s.invalid'](), $meta);
                        }
                        const {manifest, body} = params;
                        const resourceBody = manifest || body;
                        if (!resourceBody) {
                            throw this.error(
                                _errors['k8s.missingKey']({key: 'manifest or body'}),
                                $meta,
                            );
                        }

                        return await callApi('create', {body: resourceBody});
                    }
                    case 'update':
                    case 'replace': {
                        // Update/replace resource
                        if (Array.isArray(params)) {
                            throw this.error(_errors['k8s.invalid'](), $meta);
                        }
                        const {name, manifest, body} = params;
                        if (!name) {
                            throw this.error(_errors['k8s.missingKey']({key: 'name'}), $meta);
                        }
                        const resourceBody = manifest || body;
                        if (!resourceBody) {
                            throw this.error(
                                _errors['k8s.missingKey']({key: 'manifest or body'}),
                                $meta,
                            );
                        }

                        return await callApi('replace', {name, body: resourceBody}, subresource);
                    }
                    case 'patch': {
                        // Patch resource
                        if (Array.isArray(params)) {
                            throw this.error(_errors['k8s.invalid'](), $meta);
                        }
                        const {name, body} = params;
                        if (!name) {
                            throw this.error(_errors['k8s.missingKey']({key: 'name'}), $meta);
                        }
                        if (!body) {
                            throw this.error(_errors['k8s.missingKey']({key: 'body'}), $meta);
                        }

                        // The patch content type is not ours to choose: the generated client picks
                        // the first of json-patch, merge-patch and apply-patch it supports, which is
                        // json-patch, so a body here is a list of operations and not an object. The
                        // `options.headers` below is what the pre-1.0 client honoured; this one
                        // ignores it, and setting a header that is dropped in silence is worse than
                        // not setting it at all.
                        return await callApi(
                            'patch',
                            {
                                name,
                                body,
                                ...(!isCustomResource && {
                                    options: {
                                        headers: {
                                            'Content-Type':
                                                'application/strategic-merge-patch+json',
                                        },
                                    },
                                }),
                            },
                            subresource,
                        );
                    }
                    case 'delete':
                    case 'remove': {
                        // Delete resource
                        if (Array.isArray(params)) {
                            throw this.error(_errors['k8s.invalid'](), $meta);
                        }
                        const {name, propagationPolicy} = params;
                        if (!name) {
                            throw this.error(_errors['k8s.missingKey']({key: 'name'}), $meta);
                        }

                        // Name the cascade, because leaving it to the API server leaves a Job's pods
                        // behind. They are not dependents by finalizer: the deletion orphans them, so
                        // they lose their owner reference and no collector ever picks them up — a
                        // suite's namespace held 37 ownerless pods against 7 Jobs (D-492). `Background`
                        // is what `kubectl delete` uses: the Job goes, its pods follow, and the caller
                        // is not kept waiting for them (which `Foreground` would do inside a pass).
                        // A caller that wants another policy can name it in the params.
                        return await callApi('delete', {
                            name,
                            propagationPolicy:
                                typeof propagationPolicy === 'string'
                                    ? propagationPolicy
                                    : 'Background',
                        });
                    }
                    case 'apply': {
                        // Apply resource (create or update)
                        if (Array.isArray(params)) {
                            throw this.error(_errors['k8s.invalid'](), $meta);
                        }
                        const {manifest, body} = params;
                        const resourceBody = manifest || body;
                        if (!resourceBody) {
                            throw this.error(
                                _errors['k8s.missingKey']({key: 'manifest or body'}),
                                $meta,
                            );
                        }

                        const name = (resourceBody as {metadata?: {name?: string}}).metadata?.name;
                        if (!name) {
                            throw this.error(
                                _errors['k8s.missingKey']({key: 'name in manifest'}),
                                $meta,
                            );
                        }

                        // Read first, and only an *absent* answer means the object has to be created.
                        // Every other read failure used to be read as absence, and the create that
                        // followed answered `409 already exists` for an object that was there all
                        // along: a pass reported it as a failed step, and the message named the
                        // create rather than the read that had actually gone wrong (F-402).
                        let exists = false;
                        let live: unknown;
                        try {
                            live = await callApi(isCustomResource ? 'get' : 'read', {name});
                            exists = true;
                        } catch (error) {
                            if (!isAbsent(error)) {
                                throw this.error(
                                    _errors['k8s.failed']({
                                        params: {
                                            message:
                                                `reading ${resourceType}/${name} failed: ` +
                                                `${(error as Error).message}`,
                                            status: statusOf(error) ?? 'none',
                                        },
                                    }),
                                    $meta,
                                );
                            }
                        }
                        if (exists) {
                            // The object that is there is the update's starting point: the fields
                            // the manifest cannot express come from it (`withServerFields`).
                            return await callApi('replace', {
                                name,
                                body: withServerFields(live, resourceBody),
                            });
                        }

                        try {
                            return await callApi('create', {body: resourceBody});
                        } catch (error) {
                            // It appeared between the read and the create — another pass, or a
                            // person. The desired state is still the desired state, so the answer
                            // is the update the read would have produced, and an apply stays
                            // idempotent (F-402).
                            if (!isAlreadyThere(error)) throw error;
                            const appeared = await callApi(isCustomResource ? 'get' : 'read', {
                                name,
                            });
                            return await callApi('replace', {
                                name,
                                body: withServerFields(appeared, resourceBody),
                            });
                        }
                    }
                    case 'scale': {
                        // Scale deployment/replicaset (not supported for custom resources)
                        if (isCustomResource) {
                            throw this.error(_errors['k8s.invalid'](), $meta);
                        }

                        if (Array.isArray(params)) {
                            throw this.error(_errors['k8s.invalid'](), $meta);
                        }
                        const {name, replicas} = params;
                        if (!name) {
                            throw this.error(_errors['k8s.missingKey']({key: 'name'}), $meta);
                        }
                        if (replicas === undefined) {
                            throw this.error(_errors['k8s.missingKey']({key: 'replicas'}), $meta);
                        }

                        if (resourceType === 'deployment' || resourceType === 'deployments') {
                            // First get the current deployment
                            const current =
                                await this.config.context.appsV1Api!.readNamespacedDeployment({
                                    name,
                                    namespace,
                                });

                            // Update replicas and replace
                            const updatedDeployment: k8s.V1Deployment = {
                                ...current,
                                spec: {
                                    ...current.spec,
                                    replicas: replicas as number,
                                } as k8s.V1DeploymentSpec,
                            };

                            const result =
                                await this.config.context.appsV1Api!.replaceNamespacedDeployment({
                                    name,
                                    namespace,
                                    body: updatedDeployment,
                                });
                            return result;
                        }
                        throw this.error(_errors['k8s.invalid'](), $meta);
                    }
                    case 'watch': {
                        if (Array.isArray(params)) {
                            throw this.error(_errors['k8s.invalid'](), $meta);
                        }
                        const {labelSelector, fieldSelector, timeout = 30000} = params;

                        // Get existing resources using list. The coordinates travel with it, the same
                        // way every other verb needs them for a custom resource: without them the
                        // initial list answers nothing, so a watch that starts correctly still
                        // delivers no existing object — and a controller that acts on the list to
                        // converge after a restart has nothing to act on.
                        const existing = await callApi('list', {
                            ...(isCustomResource && !Array.isArray(params)
                                ? {
                                      group: params.group,
                                      version: params.version,
                                      plural: params.plural,
                                      ...(params.namespaced !== undefined && {
                                          namespaced: params.namespaced,
                                      }),
                                  }
                                : {}),
                            ...(labelSelector && {labelSelector}),
                            ...(fieldSelector && {fieldSelector}),
                        });
                        const resourceVersion = (
                            existing as {metadata?: {resourceVersion?: string}}
                        ).metadata?.resourceVersion;

                        // Build watch path
                        let watchPath: string;
                        if (isCustomResource && !Array.isArray(params)) {
                            const {group, version, plural} = params;
                            watchPath = isNamespaced
                                ? `/apis/${group}/${version}/namespaces/${namespace}/${plural}`
                                : `/apis/${group}/${version}/${plural}`;
                        } else {
                            // The URL names the resource, so the separators that keep a compound
                            // kind readable in the method name do not belong in it.
                            watchPath = `/api/v1/namespaces/${namespace}/${gluedType(_resourceType)}`;
                        }

                        let timer: NodeJS.Timeout | null;
                        const clearTimer = (): void => {
                            if (timer) {
                                clearTimeout(timer);
                                timer = null;
                            }
                        };
                        const events: Promise<{type: string; object: unknown}>[] = [];
                        let eventResolve: (value: {type: string; object: unknown}) => void,
                            eventReject: (reason?: unknown) => void;
                        const createEventPromise = (): void => {
                            events.push(
                                new Promise<{type: string; object: unknown}>((resolve, reject) => {
                                    eventResolve = value => {
                                        createEventPromise();
                                        resolve(value);
                                    };
                                    eventReject = reject;
                                }),
                            );
                        };
                        createEventPromise();

                        const watch = await this.config.context.watcher!.watch(
                            watchPath,
                            {fieldSelector, resourceVersion, labelSelector},
                            (type, object) => {
                                this.log?.debug?.({object}, `Event: ${type}`);
                                if (type === 'ERROR') {
                                    eventReject(new Error(object.message || 'Watch error event'));
                                } else eventResolve({type, object});
                            },
                            error => {
                                if (watch?.signal && !watch.signal.reason) return;
                                eventReject(new Error(watch?.signal?.reason || error.message));
                            },
                        );
                        let aborted = false;
                        const abortOnce = (reason?: unknown): void => {
                            clearTimer();
                            if (!aborted) {
                                aborted = true;
                                watch?.abort(reason);
                            }
                        };
                        timer = setTimeout(
                            () => abortOnce(`Timeout watching ${watchPath} after ${timeout}ms`),
                            timeout,
                        );
                        return {
                            events: (async function* watchEvents() {
                                try {
                                    while (true) yield await events.shift();
                                } finally {
                                    abortOnce(false);
                                }
                            })(),
                            existing,
                        };
                    }
                }
            } catch (error: unknown) {
                // Re-throw already-typed blong errors without wrapping
                if (typeof (error as {type?: string}).type === 'string') throw error;
                const status = statusOf(error);
                let err;
                if (status === 404) {
                    err = _errors['k8s.notFound'](error);
                } else if (status === 401) {
                    err = _errors['k8s.unauthorized'](error);
                } else if (status === 403) {
                    err = _errors['k8s.forbidden'](error);
                } else if (status === 409) {
                    err = _errors['k8s.exists'](error);
                } else {
                    err = _errors['k8s.failed']({
                        params: {
                            message: apiMessageOf(error) ?? String(error),
                            status: status ?? 'none',
                        },
                    });
                }
                throw this.error(err, $meta);
            }

            // Nothing above matched the verb. Say so, with the method: the name is the whole question
            // here, because the adapter answers `<resource><verb>` and a custom resource reaches it
            // as the resource type `custom` — so a plausible-looking `clusterBlongDeploymentFind`
            // falls through to this line, which used to say only "Kubernetes Error" (F-380).
            throw this.error(
                _errors['k8s.failed']({
                    params: {
                        message: `no verb matched for ${String($meta?.method ?? 'this call')}`,
                        status: 'none',
                    },
                }),
                $meta,
            );
        },
    };
});
