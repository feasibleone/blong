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
                ...configs
            );
        },
        async start() {
            const kc = new k8s.KubeConfig();

            // Load kubeconfig based on configuration
            if (this.config.k8s.kubeconfig) {
                kc.loadFromFile(this.config.k8s.kubeconfig);
            } else if (this.config.k8s.cluster && this.config.k8s.user) {
                // Manual configuration
                kc.loadFromOptions({
                    clusters: [
                        {
                            name: 'cluster',
                            server: this.config.k8s.cluster.server,
                            skipTLSVerify: this.config.k8s.cluster.skipTLSVerify,
                            caData: this.config.k8s.cluster.caData,
                        },
                    ],
                    users: [
                        {
                            name: 'user',
                            token: this.config.k8s.user.token,
                            username: this.config.k8s.user.username,
                            password: this.config.k8s.user.password,
                            certData: this.config.k8s.user.certData,
                            keyData: this.config.k8s.user.keyData,
                        },
                    ],
                    contexts: [
                        {
                            name: 'context',
                            cluster: 'cluster',
                            user: 'user',
                            namespace: this.config.k8s.namespace,
                        },
                    ],
                    currentContext: 'context',
                });
            } else {
                // Try default locations
                kc.loadFromDefault();
            }

            // Set context if specified
            if (this.config.k8s.context) {
                kc.setCurrentContext(this.config.k8s.context);
            }

            // Initialize API clients
            this.config.context = {
                coreV1Api: kc.makeApiClient(k8s.CoreV1Api),
                appsV1Api: kc.makeApiClient(k8s.AppsV1Api),
                networkingV1Api: kc.makeApiClient(k8s.NetworkingV1Api),
                rbacV1Api: kc.makeApiClient(k8s.RbacAuthorizationV1Api),
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
                      continue?: string;
                  } & Record<string, unknown>)
                | unknown[],
            {method}: IMeta
        ) {
            const [, resourceType, operation] = method.split('.');
            const namespace =
                (!Array.isArray(params) && params.namespace) ||
                this.config.k8s.namespace ||
                'default';

            // Determine which API to use based on resource type
            const getApiForResource = (
                resource: string
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

            const api = getApiForResource(resourceType);

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
                            const result = await api[methodName](name, namespace);
                            return result.body;
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
                            const args = namespace ? [namespace] : [];
                            const options = {
                                labelSelector,
                                fieldSelector,
                                limit,
                                continue: continueToken,
                            };
                            const result = await api[methodName](
                                ...args,
                                undefined,
                                undefined,
                                undefined,
                                undefined,
                                options.labelSelector,
                                undefined,
                                undefined,
                                options.fieldSelector,
                                options.limit,
                                options.continue
                            );
                            return result.body;
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
                            const args = namespace ? [namespace, resourceBody] : [resourceBody];
                            const result = await api[methodName](...args);
                            return result.body;
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
                            const args = namespace
                                ? [name, namespace, resourceBody]
                                : [name, resourceBody];
                            const result = await api[methodName](...args);
                            return result.body;
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
                            const args = namespace ? [name, namespace, body] : [name, body];
                            const result = await api[methodName](
                                ...args,
                                undefined,
                                undefined,
                                undefined,
                                undefined,
                                {'Content-Type': 'application/strategic-merge-patch+json'}
                            );
                            return result.body;
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
                            const args = namespace ? [name, namespace] : [name];
                            const result = await api[methodName](...args);
                            return result.body;
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
                            await api[getMethodName](name, namespace);

                            // Resource exists, update it
                            const updateMethodName = `replace${
                                namespace ? 'Namespaced' : ''
                            }${resourceType.charAt(0).toUpperCase()}${resourceType.slice(1)}`;
                            const args = namespace
                                ? [name, namespace, resourceBody]
                                : [name, resourceBody];
                            const result = await api[updateMethodName](...args);
                            return result.body;
                        } catch (error) {
                            // Resource doesn't exist, create it
                            const createMethodName = `create${
                                namespace ? 'Namespaced' : ''
                            }${resourceType.charAt(0).toUpperCase()}${resourceType.slice(1)}`;
                            const args = namespace ? [namespace, resourceBody] : [resourceBody];
                            const result = await api[createMethodName](...args);
                            return result.body;
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
                throw _errors['k8s.generic']();
            }

            throw _errors['k8s.generic']();
        },
    };
});
