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
        coreV1Api: k8s.CoreV1Api;
        appsV1Api: k8s.AppsV1Api;
        networkingV1Api: k8s.NetworkingV1Api;
        rbacV1Api: k8s.RbacAuthorizationV1Api;
        customObjectsApi: k8s.CustomObjectsApi;
        watcher: k8s.Watch;
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
                this.config.context = null;
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
            {method}: IMeta,
        ) {
            const [, _resourceType, operation] = method.split('.');
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
                        return this.config.context.coreV1Api;
                    case 'deployment':
                    case 'deployments':
                    case 'replicaset':
                    case 'replicasets':
                    case 'daemonset':
                    case 'daemonsets':
                    case 'statefulset':
                    case 'statefulsets':
                        return this.config.context.appsV1Api;
                    case 'ingress':
                    case 'ingresses':
                    case 'networkpolicy':
                    case 'networkpolicies':
                        return this.config.context.networkingV1Api;
                    case 'role':
                    case 'roles':
                    case 'rolebinding':
                    case 'rolebindings':
                    case 'clusterrole':
                    case 'clusterroles':
                    case 'clusterrolebinding':
                    case 'clusterrolebindings':
                        return this.config.context.rbacV1Api;
                    default:
                        return this.config.context.coreV1Api;
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
                    throw _errors['k8s.missingKey']({
                        key: 'group, version, and plural for custom resources',
                    });
                }
            }

            // Select API and build method name based on resource type
            const api = isCustomResource
                ? this.config.context.customObjectsApi
                : getApiForResource(_resourceType);
            const isNamespaced = isCustomResource
                ? !Array.isArray(params) && params.namespaced !== false
                : !!namespace;

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
                if (typeof api[methodName] === 'function') {
                    return await api[methodName](buildOptions(options));
                }
                throw _errors['k8s.invalid']();
            };

            try {
                switch (operation) {
                    case 'get': {
                        // Get single resource
                        if (Array.isArray(params)) throw _errors['k8s.invalid']();
                        const {name} = params;
                        if (!name) throw _errors['k8s.missingKey']({key: 'name'});

                        return await callApi(isCustomResource ? 'get' : 'read', {name});
                    }
                    case 'list':
                    case 'find': {
                        // List resources
                        if (Array.isArray(params)) throw _errors['k8s.invalid']();
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
                    case 'create':
                    case 'add': {
                        // Create resource
                        if (Array.isArray(params)) throw _errors['k8s.invalid']();
                        const {manifest, body} = params;
                        const resourceBody = manifest || body;
                        if (!resourceBody)
                            throw _errors['k8s.missingKey']({key: 'manifest or body'});

                        return await callApi('create', {body: resourceBody});
                    }
                    case 'update':
                    case 'replace': {
                        // Update/replace resource
                        if (Array.isArray(params)) throw _errors['k8s.invalid']();
                        const {name, manifest, body} = params;
                        if (!name) throw _errors['k8s.missingKey']({key: 'name'});
                        const resourceBody = manifest || body;
                        if (!resourceBody)
                            throw _errors['k8s.missingKey']({key: 'manifest or body'});

                        return await callApi('replace', {name, body: resourceBody});
                    }
                    case 'patch': {
                        // Patch resource
                        if (Array.isArray(params)) throw _errors['k8s.invalid']();
                        const {name, body} = params;
                        if (!name) throw _errors['k8s.missingKey']({key: 'name'});
                        if (!body) throw _errors['k8s.missingKey']({key: 'body'});

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
                        if (Array.isArray(params)) throw _errors['k8s.invalid']();
                        const {name} = params;
                        if (!name) throw _errors['k8s.missingKey']({key: 'name'});

                        return await callApi('delete', {name});
                    }
                    case 'apply': {
                        // Apply resource (create or update)
                        if (Array.isArray(params)) throw _errors['k8s.invalid']();
                        const {manifest, body} = params;
                        const resourceBody = manifest || body;
                        if (!resourceBody)
                            throw _errors['k8s.missingKey']({key: 'manifest or body'});

                        const name = (resourceBody as {metadata?: {name?: string}}).metadata?.name;
                        if (!name) throw _errors['k8s.missingKey']({key: 'name in manifest'});

                        try {
                            // Try to get existing resource
                            await callApi(isCustomResource ? 'get' : 'read', {name});
                            // Resource exists, update it
                            return await callApi('replace', {name, body: resourceBody});
                        } catch (error) {
                            // Resource doesn't exist, create it
                            return await callApi('create', {body: resourceBody});
                        }
                    }
                    case 'scale': {
                        // Scale deployment/replicaset (not supported for custom resources)
                        if (isCustomResource) {
                            throw _errors['k8s.invalid']();
                        }

                        if (Array.isArray(params)) throw _errors['k8s.invalid']();
                        const {name, replicas} = params;
                        if (!name) throw _errors['k8s.missingKey']({key: 'name'});
                        if (replicas === undefined)
                            throw _errors['k8s.missingKey']({key: 'replicas'});

                        if (resourceType === 'deployment' || resourceType === 'deployments') {
                            // First get the current deployment
                            const current =
                                await this.config.context.appsV1Api.readNamespacedDeployment({
                                    name,
                                    namespace,
                                });

                            // Update replicas and replace
                            const updatedDeployment = {
                                ...current,
                                spec: {
                                    ...current.spec,
                                    replicas: replicas as number,
                                },
                            };

                            const result =
                                await this.config.context.appsV1Api.replaceNamespacedDeployment({
                                    name,
                                    namespace,
                                    body: updatedDeployment,
                                });
                            return result;
                        }
                        throw _errors['k8s.invalid']();
                    }
                    case 'watch': {
                        if (Array.isArray(params)) throw _errors['k8s.invalid']();
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

                        const watch = await this.config.context.watcher.watch(
                            watchPath,
                            {fieldSelector, resourceVersion, labelSelector},
                            (type, object) => {
                                this.log.debug?.({object}, `Event: ${type}`);
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
                const k8sError = error as {
                    response?: {statusCode?: number; body?: {message?: string}};
                };
                if (k8sError.response?.statusCode === 404) {
                    throw _errors['k8s.notFound']();
                } else if (k8sError.response?.statusCode === 401) {
                    throw _errors['k8s.unauthorized']();
                } else if (k8sError.response?.statusCode === 403) {
                    throw _errors['k8s.forbidden']();
                } else if (k8sError.response?.statusCode === 409) {
                    throw _errors['k8s.exists']();
                }
                throw _errors['k8s.generic'](error);
            }

            throw _errors['k8s.generic']();
        },
    };
});
