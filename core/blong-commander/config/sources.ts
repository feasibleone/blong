import type {ICommanderSource} from '../types.js';

/**
 * Default commander sources — the declarative vocabulary for the 8 backends.
 *
 * Instance namespaces are lowercase (e.g. `sql-dev`, `k8s-dev`). The external
 * backends' adapters (k8s/s3/vault/mongo/redis/kafka/keycloak) are wired by the
 * consuming suite; the `access-db` source works against any realm DB exposed by
 * blong-server's shared `srv.db` adapter.
 */
export const sources: ICommanderSource[] = [
    {
        name: 'access-db',
        label: 'Access DB',
        icon: 'pi pi-database',
        levels: [
            {
                resourceType: 'table',
                label: 'Table',
                keyField: 'tableName',
                labelField: 'tableName',
                viewer: 'table',
                permission: 'access.table.list',
                list: {method: 'access.table.list', resultSet: 'items'},
            },
            {
                resourceType: 'row',
                label: 'Row',
                keyField: 'roleId',
                labelField: 'roleId',
                viewer: 'document',
                open: {method: 'access.{tableName}.get'},
                list: {method: 'access.{tableName}.find'},
            },
        ],
    },
    {
        name: 'k8s-dev',
        label: 'Kubernetes (dev)',
        icon: 'pi pi-server',
        levels: [
            {
                resourceType: 'namespace',
                keyField: 'metadata.name',
                labelField: 'metadata.name',
                permission: 'k8sDev.namespace.list',
                list: {method: 'k8s-dev.namespace.list', resultSet: 'items'},
            },
            {
                resourceType: 'category',
                keyField: 'category',
                labelField: 'label',
                // Synthetic navigation level — no RBAC gate (the namespace level
                // above already gates access to the k8s source).
                list: {
                    method: 'k8s-dev.category.list',
                    resultSet: 'items',
                    params: {namespace: '{parent.metadata.name}'},
                },
            },
            {
                resourceType: 'resource',
                keyField: 'resourceType',
                labelField: 'label',
                // Synthetic navigation level — no RBAC gate (see category).
                list: {
                    method: 'k8s-dev.resource.list',
                    resultSet: 'items',
                    params: {category: '{parent.category}', namespace: '{parent.namespace}'},
                },
            },
            {
                resourceType: 'item',
                keyField: 'metadata.name',
                labelField: 'metadata.name',
                viewer: 'document',
                list: {
                    method: 'k8s-dev.{resourceType}.find',
                    resultSet: 'items',
                    params: {namespace: '{parent.namespace}'},
                },
            },
        ],
    },
    {
        name: 's3-dev',
        label: 'S3 (dev)',
        icon: 'pi pi-box',
        levels: [
            {
                resourceType: 'bucket',
                keyField: 'bucket',
                labelField: 'bucket',
                permission: 's3Dev.bucket.list',
                list: {method: 's3-dev.bucket.list', resultSet: 'items'},
            },
            {
                resourceType: 'object',
                keyField: 'Key',
                labelField: 'Key',
                viewer: 'file',
                permission: 's3Dev.object.list',
                open: {method: 's3-dev.object.get', params: {bucket: '{parent.bucket}', key: '{Key}'}},
                list: {
                    method: 's3-dev.object.list',
                    resultSet: 'Contents',
                    params: {bucket: '{parent.bucket}'},
                },
            },
        ],
    },
    {
        name: 'vault-dev',
        label: 'Vault (dev)',
        icon: 'pi pi-lock',
        levels: [
            {
                resourceType: 'mount',
                keyField: 'path',
                labelField: 'path',
                permission: 'vaultDev.mount.list',
                list: {method: 'vault-dev.mount.list', resultSet: 'items'},
            },
            {
                resourceType: 'secret',
                keyField: 'key',
                labelField: 'key',
                viewer: 'secret',
                permission: 'vaultDev.secret.list',
                open: {method: 'vault-dev.secret.get', params: {path: '{parent.path}/{key}'}},
                list: {
                    method: 'vault-dev.secret.list',
                    resultSet: 'items',
                    params: {path: '{parent.path}'},
                },
            },
        ],
    },
    {
        name: 'mongo-dev',
        label: 'MongoDB (dev)',
        icon: 'pi pi-database',
        levels: [
            {
                resourceType: 'database',
                keyField: 'database',
                labelField: 'database',
                permission: 'mongoDev.database.list',
                list: {method: 'mongo-dev.database.list', resultSet: 'items'},
            },
            {
                resourceType: 'collection',
                keyField: 'collection',
                labelField: 'collection',
                permission: 'mongoDev.collection.list',
                list: {
                    method: 'mongo-dev.collection.list',
                    resultSet: 'items',
                    params: {database: '{parent.database}'},
                },
            },
            {
                resourceType: 'document',
                keyField: 'id',
                labelField: 'id',
                viewer: 'document',
                permission: 'mongoDev.collection.find',
                open: {
                    method: 'mongo-dev.collection.get',
                    params: {database: '{parent.database}', collection: '{parent.collection}'},
                },
                list: {
                    method: 'mongo-dev.collection.find',
                    params: {database: '{parent.database}', collection: '{parent.collection}'},
                },
            },
        ],
    },
    {
        name: 'redis-dev',
        label: 'Redis (dev)',
        icon: 'pi pi-database',
        levels: [
            {
                resourceType: 'database',
                keyField: 'db',
                labelField: 'db',
                permission: 'redisDev.database.list',
                list: {method: 'redis-dev.database.list', resultSet: 'items'},
            },
            {
                resourceType: 'key',
                keyField: 'keyName',
                labelField: 'keyName',
                viewer: 'keyValue',
                permission: 'redisDev.key.list',
                open: {method: 'redis-dev.key.get', params: {keyName: '{keyName}'}},
                list: {method: 'redis-dev.key.list', resultSet: 'items'},
            },
        ],
    },
    {
        name: 'kafka-dev',
        label: 'Kafka (dev)',
        icon: 'pi pi-server',
        levels: [
            {
                resourceType: 'topic',
                keyField: 'topic',
                labelField: 'topic',
                permission: 'kafkaDev.topic.list',
                list: {method: 'kafka-dev.topic.list', resultSet: 'items'},
            },
            {
                resourceType: 'message',
                keyField: 'offset',
                labelField: 'offset',
                viewer: 'message',
                permission: 'kafkaDev.topic.find',
                list: {
                    method: 'kafka-dev.topic.find',
                    resultSet: 'items',
                    params: {topic: '{parent.topic}'},
                },
            },
        ],
    },
    {
        name: 'keycloak-dev',
        label: 'Keycloak (dev)',
        icon: 'pi pi-id-card',
        levels: [
            {
                resourceType: 'realm',
                keyField: 'realm',
                labelField: 'realm',
                permission: 'keycloakDev.realm.list',
                list: {method: 'keycloak-dev.realm.list', resultSet: 'items'},
            },
            {
                resourceType: 'user',
                keyField: 'username',
                labelField: 'username',
                viewer: 'document',
                permission: 'keycloakDev.user.find',
                list: {
                    method: 'keycloak-dev.user.find',
                    resultSet: 'items',
                    params: {realm: '{parent.realm}'},
                },
            },
        ],
    },
];
