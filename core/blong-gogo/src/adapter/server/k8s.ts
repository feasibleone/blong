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
        networkingV1Api?: k8s.NetworkingV1Api;
        rbacV1Api?: k8s.RbacAuthorizationV1Api;
        customObjectsApi?: k8s.CustomObjectsApi;
        watcher?: k8s.Watch;
    };
}

const errorMap: IErrorMap = {
    'k8s.generic': 'Kubernetes Error',
    'k8s.invalid': 'Invalid Kubernetes Operation',
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
 * Commander explorer categories for namespaced resources. Each category groups
 * the resource types the adapter can list (`{ns}.<resource>.find`). The
 * category / resource levels are synthetic navigation (no cluster calls).
 */
const CATEGORIES: Array<{name: string; label: string; resources: Array<{type: string; label: string}>}> = [
    {
        name: 'workloads',
        label: 'Workloads',
        resources: [
            {type: 'deployment', label: 'Deployments'},
            {type: 'replicaset', label: 'ReplicaSets'},
            {type: 'daemonset', label: 'DaemonSets'},
            {type: 'statefulset', label: 'StatefulSets'},
            {type: 'pod', label: 'Pods'},
        ],
    },
    {
        name: 'networking',
        label: 'Networking',
        resources: [
            {type: 'service', label: 'Services'},
            {type: 'ingress', label: 'Ingresses'},
            {type: 'networkpolicy', label: 'NetworkPolicies'},
        ],
    },
    {
        name: 'storage',
        label: 'Storage',
        resources: [
            {type: 'persistentvolume', label: 'PersistentVolumes'},
            {type: 'persistentvolumeclaim', label: 'PersistentVolumeClaims'},
            {type: 'storageclass', label: 'StorageClasses'},
        ],
    },
    {
        name: 'configuration',
        label: 'Configuration',
        resources: [
            {type: 'configmap', label: 'ConfigMaps'},
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
            // Load kubeconfig based on configuration
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

            // Set context if specified
            if (k8sConfig.context) {
                kc.setCurrentContext(k8sConfig.context);
            }

            // Initialize API clients
            this.config.context = {
                coreV1Api: kc.makeApiClient(k8s.CoreV1Api),
                appsV1Api: kc.makeApiClient(k8s.AppsV1Api),
                networkingV1Api: kc.makeApiClient(k8s.NetworkingV1Api),
                rbacV1Api: kc.makeApiClient(k8s.RbacAuthorizationV1Api),
                customObjectsApi: kc.makeApiClient(k8s.CustomObjectsApi),
                watcher: new k8s.Watch(kc),
            };

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
            ): k8s.CoreV1Api | k8s.AppsV1Api | k8s.NetworkingV1Api | k8s.RbacAuthorizationV1Api => {
                switch (resource.toLowerCase()) {
                    case 'pod':
                    case 'pods':
                    case 'service':
                    case 'services':
                    case 'configmap':
                    case 'configmaps':
                    case 'secret':
                    case 'secrets':
                    case 'namespace':
                    case 'namespaces':
                    case 'node':
                    case 'nodes':
                    case 'persistentvolume':
                    case 'persistentvolumes':
                    case 'persistentvolumeclaim':
                    case 'persistentvolumeclaims':
                        return this.config.context.coreV1Api!;
                    case 'deployment':
                    case 'deployments':
                    case 'replicaset':
                    case 'replicasets':
                    case 'daemonset':
                    case 'daemonsets':
                    case 'statefulset':
                    case 'statefulsets':
                        return this.config.context.appsV1Api!;
                    case 'ingress':
                    case 'ingresses':
                    case 'networkpolicy':
                    case 'networkpolicies':
                        return this.config.context.networkingV1Api!;
                    case 'role':
                    case 'roles':
                    case 'rolebinding':
                    case 'rolebindings':
                    case 'clusterrole':
                    case 'clusterroles':
                    case 'clusterrolebinding':
                    case 'clusterrolebindings':
                        return this.config.context.rbacV1Api!;
                    default:
                        return this.config.context.coreV1Api!;
                }
            };
            const getResourceType = (resource: string): string => {
                // Normalize resource type for method naming
                switch (resource.toLowerCase()) {
                    case 'pods':
                        return 'pod';
                    case 'services':
                        return 'service';
                    case 'configmaps':
                        return 'configmap';
                    case 'secrets':
                        return 'secret';
                    case 'namespaces':
                        return 'namespace';
                    case 'nodes':
                        return 'node';
                    case 'persistentvolumes':
                        return 'persistentvolume';
                    case 'persistentvolumeclaims':
                        return 'persistentvolumeclaim';
                    case 'deployments':
                        return 'deployment';
                    case 'replicasets':
                        return 'replicaset';
                    case 'daemonsets':
                        return 'daemonset';
                    case 'statefulsets':
                        return 'statefulset';
                    case 'ingresses':
                        return 'ingress';
                    case 'networkpolicies':
                        return 'networkpolicy';
                    case 'roles':
                        return 'role';
                    case 'rolebindings':
                        return 'rolebinding';
                    case 'clusterroles':
                        return 'clusterrole';
                    case 'clusterrolebindings':
                        return 'clusterrolebinding';
                    default:
                        return resource;
                }
            };

            const resourceType = getResourceType(_resourceType);

            // Check if this is a custom resource request (resourceType will be 'custom')
            const isCustomResource = resourceType === 'custom' && !Array.isArray(params);

            // Validate custom resource params
            if (isCustomResource) {
                if (!params.group || !params.version || !params.plural) {
                    throw this.error(_errors['k8s.missingKey']({key: 'group, version, and plural for custom resources'}), $meta);
                }
            }

            // Select API and build method name based on resource type
            const api = isCustomResource
                ? this.config.context.customObjectsApi
                : getApiForResource(_resourceType);
            const CLUSTER_SCOPED_RESOURCES = new Set([
                'namespace',
                'node',
                'persistentvolume',
                'clusterrole',
                'clusterrolebinding',
                'storageclass',
                'priorityclass',
                'ingressclass',
            ]);
            const isNamespaced = isCustomResource
                ? !Array.isArray(params) && params.namespaced !== false
                : !!namespace && !CLUSTER_SCOPED_RESOURCES.has(resourceType);

            // Helper to build method name
            const getMethodName = (verb: string): string => {
                if (isCustomResource) {
                    return `${verb}${isNamespaced ? 'Namespaced' : 'Cluster'}CustomObject`;
                }
                const prefix = isNamespaced ? 'Namespaced' : '';
                const resource = resourceType.charAt(0).toUpperCase() + resourceType.slice(1);
                return `${verb}${prefix}${resource}`;
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
            ): Promise<unknown> => {
                const methodName = getMethodName(verb);
                const apiRecord = api as unknown as Record<string, unknown>;
                if (typeof apiRecord[methodName] === 'function') {
                    return await (apiRecord[methodName] as (opts: unknown) => Promise<unknown>)(
                        buildOptions(options),
                    );
                }
                throw this.error(_errors['k8s.invalid'](), $meta);
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
                    return {items: CATEGORIES.map(c => ({category: c.name, label: c.label, namespace: ns}))};
                }
                if (_resourceType === 'resource' && operation === 'list') {
                    const category =
                        !Array.isArray(params) ? (params.category as string | undefined) : undefined;
                    const ns =
                        (!Array.isArray(params) && params.namespace) ||
                        this.config.k8s.namespace ||
                        'default';
                    const cat = CATEGORIES.find(c => c.name === category);
                    const resources = cat?.resources ?? [];
                    return {
                        items: resources.map(r => ({resourceType: r.type, label: r.label, namespace: ns})),
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

                        return await callApi(isCustomResource ? 'get' : 'read', {name});
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

                        return await callApi('list', {
                            ...(labelSelector && {labelSelector}),
                            ...(fieldSelector && {fieldSelector}),
                            ...(limit && {limit}),
                            ...(continueToken && {continue: continueToken}),
                        });
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
                            throw this.error(_errors['k8s.missingKey']({key: 'manifest or body'}), $meta);
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
                            throw this.error(_errors['k8s.missingKey']({key: 'manifest or body'}), $meta);
                        }

                        return await callApi('replace', {name, body: resourceBody});
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

                        return await callApi('patch', {
                            name,
                            body,
                            ...(!isCustomResource && {
                                options: {
                                    headers: {
                                        'Content-Type': 'application/strategic-merge-patch+json',
                                    },
                                },
                            }),
                        });
                    }
                    case 'delete':
                    case 'remove': {
                        // Delete resource
                        if (Array.isArray(params)) {
                            throw this.error(_errors['k8s.invalid'](), $meta);
                        }
                        const {name} = params;
                        if (!name) {
                            throw this.error(_errors['k8s.missingKey']({key: 'name'}), $meta);
                        }

                        return await callApi('delete', {name});
                    }
                    case 'apply': {
                        // Apply resource (create or update)
                        if (Array.isArray(params)) {
                            throw this.error(_errors['k8s.invalid'](), $meta);
                        }
                        const {manifest, body} = params;
                        const resourceBody = manifest || body;
                        if (!resourceBody) {
                            throw this.error(_errors['k8s.missingKey']({key: 'manifest or body'}), $meta);
                        }

                        const name = (resourceBody as {metadata?: {name?: string}}).metadata?.name;
                        if (!name) {
                            throw this.error(_errors['k8s.missingKey']({key: 'name in manifest'}), $meta);
                        }

                        try {
                            // Try to get existing resource
                            await callApi(isCustomResource ? 'get' : 'read', {name});
                            // Resource exists, update it
                            return await callApi('replace', {name, body: resourceBody});
                        } catch (_error) {
                            // Resource doesn't exist, create it
                            return await callApi('create', {body: resourceBody});
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

                        // Get existing resources using list
                        const existing = await callApi('list', {
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
                            watchPath = `/api/v1/namespaces/${namespace}/${_resourceType.toLowerCase()}`;
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
                const k8sError = error as {
                    response?: {statusCode?: number; body?: {message?: string}};
                };
                let err;
                if (k8sError.response?.statusCode === 404) {
                    err = _errors['k8s.notFound'](error);
                } else if (k8sError.response?.statusCode === 401) {
                    err = _errors['k8s.unauthorized'](error);
                } else if (k8sError.response?.statusCode === 403) {
                    err = _errors['k8s.forbidden'](error);
                } else if (k8sError.response?.statusCode === 409) {
                    err = _errors['k8s.exists'](error);
                } else {
                    err = _errors['k8s.generic'](error);
                }
                throw this.error(err, $meta);
            }

            throw this.error(_errors['k8s.generic']({}), $meta);
        },
    };
});
