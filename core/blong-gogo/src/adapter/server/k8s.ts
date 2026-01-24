import {adapter, type Errors, type IErrorMap, type IMeta} from '@feasibleone/blong';
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
        async init(...configs: object[]) {
            await super.init(
                {
                    type: 'k8s',
                },
                ...configs,
            );
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

            const api = getApiForResource(_resourceType);

            try {
                switch (operation) {
                    case 'get': {
                        // Get single resource
                        if (Array.isArray(params)) throw _errors['k8s.invalid']();
                        const {name} = params;
                        if (!name) throw _errors['k8s.missingKey']({key: 'name'});

                        const methodName = `read${resourceType
                            .charAt(0)
                            .toUpperCase()}${resourceType.slice(1)}`;
                        if (typeof api[methodName] === 'function') {
                            return await api[methodName]({name, namespace});
                        }
                        throw _errors['k8s.invalid']();
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

                        const methodName = `list${namespace ? 'Namespaced' : ''}${resourceType
                            .charAt(0)
                            .toUpperCase()}${resourceType.slice(1)}`;
                        if (typeof api[methodName] === 'function') {
                            const options: Record<string, unknown> = {};
                            if (namespace) options.namespace = namespace;
                            if (labelSelector) options.labelSelector = labelSelector;
                            if (fieldSelector) options.fieldSelector = fieldSelector;
                            if (limit) options.limit = limit;
                            if (continueToken) options.continue = continueToken;

                            return await api[methodName](options);
                        }
                        throw _errors['k8s.invalid']();
                    }
                    case 'create':
                    case 'add': {
                        // Create resource
                        if (Array.isArray(params)) throw _errors['k8s.invalid']();
                        const {manifest, body} = params;
                        const resourceBody = manifest || body;
                        if (!resourceBody)
                            throw _errors['k8s.missingKey']({key: 'manifest or body'});

                        const methodName = `create${namespace ? 'Namespaced' : ''}${resourceType
                            .charAt(0)
                            .toUpperCase()}${resourceType.slice(1)}`;
                        if (typeof api[methodName] === 'function') {
                            const options = namespace
                                ? {namespace, body: resourceBody}
                                : {body: resourceBody};
                            return await api[methodName](options);
                        }
                        throw _errors['k8s.invalid']();
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

                        const methodName = `replace${namespace ? 'Namespaced' : ''}${resourceType
                            .charAt(0)
                            .toUpperCase()}${resourceType.slice(1)}`;
                        if (typeof api[methodName] === 'function') {
                            const options = namespace
                                ? {name, namespace, body: resourceBody}
                                : {name, body: resourceBody};
                            return await api[methodName](options);
                        }
                        throw _errors['k8s.invalid']();
                    }
                    case 'patch': {
                        // Patch resource
                        if (Array.isArray(params)) throw _errors['k8s.invalid']();
                        const {name, body} = params;
                        if (!name) throw _errors['k8s.missingKey']({key: 'name'});
                        if (!body) throw _errors['k8s.missingKey']({key: 'body'});

                        const methodName = `patch${namespace ? 'Namespaced' : ''}${resourceType
                            .charAt(0)
                            .toUpperCase()}${resourceType.slice(1)}`;
                        if (typeof api[methodName] === 'function') {
                            const options = namespace
                                ? {
                                      name,
                                      namespace,
                                      body,
                                      options: {
                                          headers: {
                                              'Content-Type':
                                                  'application/strategic-merge-patch+json',
                                          },
                                      },
                                  }
                                : {
                                      name,
                                      body,
                                      options: {
                                          headers: {
                                              'Content-Type':
                                                  'application/strategic-merge-patch+json',
                                          },
                                      },
                                  };
                            return await api[methodName](options);
                        }
                        throw _errors['k8s.invalid']();
                    }
                    case 'delete':
                    case 'remove': {
                        // Delete resource
                        if (Array.isArray(params)) throw _errors['k8s.invalid']();
                        const {name} = params;
                        if (!name) throw _errors['k8s.missingKey']({key: 'name'});

                        const methodName = `delete${namespace ? 'Namespaced' : ''}${resourceType
                            .charAt(0)
                            .toUpperCase()}${resourceType.slice(1)}`;
                        if (typeof api[methodName] === 'function') {
                            const options = namespace ? {name, namespace} : {name};
                            return await api[methodName](options);
                        }
                        throw _errors['k8s.invalid']();
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
                            const getMethodName = `read${resourceType
                                .charAt(0)
                                .toUpperCase()}${resourceType.slice(1)}`;
                            await api[getMethodName]({name, namespace});

                            // Resource exists, update it
                            const updateMethodName = `replace${
                                namespace ? 'Namespaced' : ''
                            }${resourceType.charAt(0).toUpperCase()}${resourceType.slice(1)}`;
                            const options = namespace
                                ? {name, namespace, body: resourceBody}
                                : {name, body: resourceBody};
                            return await api[updateMethodName](options);
                        } catch (error) {
                            // Resource doesn't exist, create it
                            const createMethodName = `create${
                                namespace ? 'Namespaced' : ''
                            }${resourceType.charAt(0).toUpperCase()}${resourceType.slice(1)}`;
                            const options = namespace
                                ? {namespace, body: resourceBody}
                                : {body: resourceBody};
                            return await api[createMethodName](options);
                        }
                    }
                    case 'scale': {
                        // Scale deployment/replicaset
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
                        const methodName = `list${namespace ? 'Namespaced' : ''}${resourceType
                            .charAt(0)
                            .toUpperCase()}${resourceType.slice(1)}`;
                        if (typeof api[methodName] === 'function') {
                            const options: Record<string, unknown> = {};
                            if (namespace) options.namespace = namespace;
                            if (labelSelector) options.labelSelector = labelSelector;
                            if (fieldSelector) options.fieldSelector = fieldSelector;

                            const existing = await api[methodName](options);
                            const resourceVersion = existing.metadata?.resourceVersion;

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
                                    new Promise<{type: string; object: unknown}>(
                                        (resolve, reject) => {
                                            eventResolve = value => {
                                                createEventPromise();
                                                resolve(value);
                                            };
                                            eventReject = reject;
                                        },
                                    ),
                                );
                            };
                            createEventPromise();

                            const watch = await this.config.context.watcher.watch(
                                `/api/v1/namespaces/${namespace}/${_resourceType.toLowerCase()}`,
                                {fieldSelector, resourceVersion, labelSelector},
                                (type, object) => {
                                    this.log.debug?.({object}, `Event: ${type}`);
                                    if (type === 'ERROR') {
                                        eventReject(
                                            new Error(object.message || 'Watch error event'),
                                        );
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
                                () =>
                                    abortOnce(
                                        `Timeout watching ${namespace}/${resourceType.toLowerCase()}/${fieldSelector || ''} ${labelSelector || ''} after ${timeout}ms`,
                                    ),
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
                        throw _errors['k8s.invalid']();
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
