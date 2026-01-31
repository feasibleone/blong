import {adapter, type Errors, type IErrorMap, type IMeta} from '@feasibleone/blong';
import KcAdminClient from '@keycloak/keycloak-admin-client';

export interface IConfig {
    keycloak: {
        baseUrl: string;
        realmName?: string;
        username?: string;
        password?: string;
        clientId?: string;
        clientSecret?: string;
        grantType?: 'password' | 'client_credentials';
        totp?: string;
        requestConfig?: {
            timeout?: number;
            headers?: Record<string, string>;
        };
    };
    context: {
        kcAdminClient: KcAdminClient;
    };
}

const errorMap: IErrorMap = {
    'keycloak.generic': 'Keycloak Error',
    'keycloak.invalid': 'Invalid Keycloak Operation',
    'keycloak.notFound': 'Keycloak Resource Not Found',
    'keycloak.exists': 'Keycloak Resource Already Exists',
    'keycloak.unauthorized': 'Keycloak Unauthorized',
    'keycloak.forbidden': 'Keycloak Access Forbidden',
    'keycloak.missingKey': 'Missing key value for {key}',
    'keycloak.authFailed': 'Keycloak authentication failed',
    'keycloak.invalidRealm': 'Invalid or missing realm',
};

let _errors: Errors<typeof errorMap>;

export default adapter<IConfig>(({utError}) => {
    _errors ||= utError.register(errorMap);

    return {
        async init(...configs: object[]) {
            await super.init(
                {
                    type: 'keycloak',
                },
                ...configs,
            );
        },
        async start() {
            const kcAdminClient = new KcAdminClient({
                baseUrl: this.config.keycloak.baseUrl,
                realmName: this.config.keycloak.realmName || 'master',
            }) as any;

            this.config.context = {kcAdminClient};

            // Authenticate with Keycloak
            try {
                const grantType = this.config.keycloak.grantType || 'password';

                if (grantType === 'password') {
                    if (!this.config.keycloak.username || !this.config.keycloak.password) {
                        throw _errors['keycloak.missingKey']({key: 'username or password'});
                    }
                    await kcAdminClient.auth({
                        grantType: 'password',
                        clientId: this.config.keycloak.clientId || 'admin-cli',
                        username: this.config.keycloak.username,
                        password: this.config.keycloak.password,
                        totp: this.config.keycloak.totp,
                    });
                } else if (grantType === 'client_credentials') {
                    if (!this.config.keycloak.clientId || !this.config.keycloak.clientSecret) {
                        throw _errors['keycloak.missingKey']({key: 'clientId or clientSecret'});
                    }
                    await kcAdminClient.auth({
                        grantType: 'client_credentials',
                        clientId: this.config.keycloak.clientId,
                        clientSecret: this.config.keycloak.clientSecret,
                    });
                }
            } catch (error) {
                throw _errors['keycloak.authFailed']();
            }

            super.connect();
            return super.start();
        },
        async stop(...params: unknown[]) {
            let result;
            try {
                // No specific cleanup needed for Keycloak admin client
            } finally {
                this.config.context = null;
                result = await super.stop(...params);
            }
            return result;
        },
        async exec(
            params:
                | ({
                      realm?: string;
                      id?: string;
                      username?: string;
                      email?: string;
                      firstName?: string;
                      lastName?: string;
                      enabled?: boolean;
                      emailVerified?: boolean;
                      password?: string;
                      temporary?: boolean;
                      groupId?: string;
                      groupName?: string;
                      roleName?: string;
                      roleId?: string;
                      clientId?: string;
                      clientUuid?: string;
                      name?: string;
                      description?: string;
                      protocol?: string;
                      publicClient?: boolean;
                      bearerOnly?: boolean;
                      standardFlowEnabled?: boolean;
                      implicitFlowEnabled?: boolean;
                      directAccessGrantsEnabled?: boolean;
                      serviceAccountsEnabled?: boolean;
                      authorizationServicesEnabled?: boolean;
                      attributes?: Record<string, unknown>;
                      roles?: string[];
                      groups?: string[];
                      max?: number;
                      first?: number;
                      search?: string;
                      briefRepresentation?: boolean;
                  } & Record<string, unknown>)
                | unknown[],
            {method}: IMeta,
        ) {
            const [, resourceType, operation] = method.split('.');
            const targetRealm =
                (!Array.isArray(params) && params.realm) ||
                this.config.keycloak.realmName ||
                'master';

            const client = this.config.context.kcAdminClient;
            client.setConfig({realmName: targetRealm});

            const adapter = {
                async handleUserOperations(
                    operation: string,
                    params: unknown[] | Record<string, unknown>,
                    client: KcAdminClient,
                ): Promise<unknown> {
                    const handleParams = Array.isArray(params) ? {} : params;

                    switch (operation) {
                        case 'get': {
                            const {id, username} = handleParams;
                            if (id) return await client.users.findOne({id: id as string});
                            if (username) {
                                const users = await client.users.find({
                                    username: username as string,
                                });
                                return users[0] || null;
                            }
                            throw _errors['keycloak.missingKey']({key: 'id or username'});
                        }

                        case 'list':
                        case 'find': {
                            const {
                                max,
                                first,
                                search,
                                email,
                                firstName,
                                lastName,
                                briefRepresentation = true,
                            } = handleParams;
                            return await client.users.find({
                                max: max as number,
                                first: first as number,
                                search: search as string,
                                email: email as string,
                                firstName: firstName as string,
                                lastName: lastName as string,
                                briefRepresentation: briefRepresentation as boolean,
                            });
                        }

                        case 'create':
                        case 'add': {
                            const {
                                username: newUsername,
                                email: newEmail,
                                firstName: newFirstName,
                                lastName: newLastName,
                                enabled = true,
                                emailVerified = false,
                            } = handleParams;
                            if (!newUsername)
                                throw _errors['keycloak.missingKey']({key: 'username'});
                            return await client.users.create({
                                username: newUsername as string,
                                email: newEmail as string,
                                firstName: newFirstName as string,
                                lastName: newLastName as string,
                                enabled: enabled as boolean,
                                emailVerified: emailVerified as boolean,
                            });
                        }

                        case 'update':
                        case 'edit': {
                            const {id: userId, ...updateData} = handleParams;
                            if (!userId) throw _errors['keycloak.missingKey']({key: 'id'});
                            return await client.users.update({id: userId as string}, updateData);
                        }

                        case 'delete':
                        case 'remove': {
                            const {id: deleteId} = handleParams;
                            if (!deleteId) throw _errors['keycloak.missingKey']({key: 'id'});
                            return await client.users.del({id: deleteId as string});
                        }

                        case 'setPassword': {
                            const {id: pwUserId, password, temporary = false} = handleParams;
                            if (!pwUserId || !password)
                                throw _errors['keycloak.missingKey']({key: 'id or password'});
                            return await client.users.resetPassword({
                                id: pwUserId as string,
                                credential: {
                                    type: 'password',
                                    value: password as string,
                                    temporary: temporary as boolean,
                                },
                            });
                        }

                        case 'addToGroup': {
                            const {id: groupUserId, groupId} = handleParams;
                            if (!groupUserId || !groupId)
                                throw _errors['keycloak.missingKey']({key: 'id or groupId'});
                            return await client.users.addToGroup({
                                id: groupUserId as string,
                                groupId: groupId as string,
                            });
                        }

                        case 'removeFromGroup': {
                            const {id: ungroupUserId, groupId: removeGroupId} = handleParams;
                            if (!ungroupUserId || !removeGroupId)
                                throw _errors['keycloak.missingKey']({key: 'id or groupId'});
                            return await client.users.delFromGroup({
                                id: ungroupUserId as string,
                                groupId: removeGroupId as string,
                            });
                        }

                        case 'addRealmRole': {
                            const {id: roleUserId, roles} = handleParams;
                            if (!roleUserId || !roles)
                                throw _errors['keycloak.missingKey']({key: 'id or roles'});
                            return await client.users.addRealmRoleMappings({
                                id: roleUserId as string,
                                roles: Array.isArray(roles)
                                    ? (roles as {id: string; name: string}[])
                                    : [],
                            });
                        }

                        case 'removeRealmRole': {
                            const {id: unroleUserId, roles: removeRoles} = handleParams;
                            if (!unroleUserId || !removeRoles)
                                throw _errors['keycloak.missingKey']({key: 'id or roles'});
                            return await client.users.delRealmRoleMappings({
                                id: unroleUserId as string,
                                roles: Array.isArray(removeRoles)
                                    ? (removeRoles as {id: string; name: string}[])
                                    : [],
                            });
                        }

                        default:
                            throw _errors['keycloak.invalid']();
                    }
                },

                async handleGroupOperations(
                    operation: string,
                    params: unknown[] | Record<string, unknown>,
                    client: KcAdminClient,
                ): Promise<unknown> {
                    const handleParams = Array.isArray(params) ? {} : params;

                    switch (operation) {
                        case 'get': {
                            const {id} = handleParams;
                            if (!id) throw _errors['keycloak.missingKey']({key: 'id'});
                            return await client.groups.findOne({id: id as string});
                        }

                        case 'list':
                        case 'find': {
                            const {
                                max: groupMax,
                                first: groupFirst,
                                search: groupSearch,
                                briefRepresentation: groupBrief = true,
                            } = handleParams;
                            return await client.groups.find({
                                max: groupMax as number,
                                first: groupFirst as number,
                                search: groupSearch as string,
                                briefRepresentation: groupBrief as boolean,
                            });
                        }

                        case 'create':
                        case 'add': {
                            const {name, path, attributes, subGroups} = handleParams;
                            if (!name) throw _errors['keycloak.missingKey']({key: 'name'});
                            return await client.groups.create({
                                name: name as string,
                                path: path as string,
                                attributes: attributes as Record<string, unknown>,
                                subGroups: subGroups as unknown[],
                            });
                        }

                        case 'update':
                        case 'edit': {
                            const {id: groupId, ...updateData} = handleParams;
                            if (!groupId) throw _errors['keycloak.missingKey']({key: 'id'});
                            return await client.groups.update({id: groupId as string}, updateData);
                        }

                        case 'delete':
                        case 'remove': {
                            const {id: deleteId} = handleParams;
                            if (!deleteId) throw _errors['keycloak.missingKey']({key: 'id'});
                            return await client.groups.del({id: deleteId as string});
                        }

                        case 'members': {
                            const {
                                id: membersGroupId,
                                max: memberMax,
                                first: memberFirst,
                                briefRepresentation: memberBrief = true,
                            } = handleParams;
                            if (!membersGroupId) throw _errors['keycloak.missingKey']({key: 'id'});
                            return await client.groups.listMembers({
                                id: membersGroupId as string,
                                max: memberMax as number,
                                first: memberFirst as number,
                                briefRepresentation: memberBrief as boolean,
                            });
                        }

                        default:
                            throw _errors['keycloak.invalid']();
                    }
                },

                async handleRoleOperations(
                    operation: string,
                    params: unknown[] | Record<string, unknown>,
                    client: KcAdminClient,
                ): Promise<unknown> {
                    const handleParams = Array.isArray(params) ? {} : params;

                    switch (operation) {
                        case 'get': {
                            const {roleName, clientUuid} = handleParams;
                            if (!roleName) throw _errors['keycloak.missingKey']({key: 'roleName'});

                            if (clientUuid) {
                                return await client.clients.findRole({
                                    id: clientUuid as string,
                                    roleName: roleName as string,
                                });
                            } else {
                                return await client.roles.findOneByName({name: roleName as string});
                            }
                        }

                        case 'list':
                        case 'find': {
                            const {
                                clientUuid: listClientUuid,
                                max: roleMax,
                                first: roleFirst,
                                search: roleSearch,
                                briefRepresentation: roleBrief = true,
                            } = handleParams;

                            if (listClientUuid) {
                                return await client.clients.listRoles({
                                    id: listClientUuid as string,
                                });
                            } else {
                                return await client.roles.find({
                                    max: roleMax as number,
                                    first: roleFirst as number,
                                    search: roleSearch as string,
                                    briefRepresentation: roleBrief as boolean,
                                });
                            }
                        }

                        case 'create':
                        case 'add': {
                            const {
                                roleName: newRoleName,
                                description,
                                clientUuid: createClientUuid,
                                attributes,
                            } = handleParams;
                            if (!newRoleName)
                                throw _errors['keycloak.missingKey']({key: 'roleName'});

                            if (createClientUuid) {
                                return await client.clients.createRole({
                                    id: createClientUuid as string,
                                    name: newRoleName as string,
                                    description: description as string,
                                    attributes: attributes
                                        ? (attributes as Record<string, string[]>)
                                        : undefined,
                                });
                            } else {
                                return await client.roles.create({
                                    name: newRoleName as string,
                                    description: description as string,
                                    attributes: attributes
                                        ? (attributes as Record<string, string[]>)
                                        : undefined,
                                });
                            }
                        }

                        case 'update':
                        case 'edit': {
                            const {
                                roleName: updateRoleName,
                                clientUuid: updateClientUuid,
                                ...updateData
                            } = handleParams;
                            if (!updateRoleName)
                                throw _errors['keycloak.missingKey']({key: 'roleName'});

                            if (updateClientUuid) {
                                return await client.clients.updateRole(
                                    {
                                        id: updateClientUuid as string,
                                        roleName: updateRoleName as string,
                                    },
                                    updateData,
                                );
                            } else {
                                return await client.roles.updateByName(
                                    {name: updateRoleName as string},
                                    updateData,
                                );
                            }
                        }

                        case 'delete':
                        case 'remove': {
                            const {roleName: deleteRoleName, clientUuid: deleteClientUuid} =
                                handleParams;
                            if (!deleteRoleName)
                                throw _errors['keycloak.missingKey']({key: 'roleName'});

                            if (deleteClientUuid) {
                                return await client.clients.delRole({
                                    id: deleteClientUuid as string,
                                    roleName: deleteRoleName as string,
                                });
                            } else {
                                return await client.roles.delByName({
                                    name: deleteRoleName as string,
                                });
                            }
                        }

                        default:
                            throw _errors['keycloak.invalid']();
                    }
                },

                async handleClientOperations(
                    operation: string,
                    params: unknown[] | Record<string, unknown>,
                    client: KcAdminClient,
                ): Promise<unknown> {
                    const handleParams = Array.isArray(params) ? {} : params;

                    switch (operation) {
                        case 'get': {
                            const {id, clientId} = handleParams;
                            if (id) return await client.clients.findOne({id: id as string});
                            if (clientId) {
                                const clients = await client.clients.find({
                                    clientId: clientId as string,
                                });
                                return clients[0] || null;
                            }
                            throw _errors['keycloak.missingKey']({key: 'id or clientId'});
                        }

                        case 'list':
                        case 'find': {
                            const {
                                clientId: searchClientId,
                                max: clientMax,
                                first: clientFirst,
                                viewableOnly = false,
                            } = handleParams;
                            return await client.clients.find({
                                clientId: searchClientId as string,
                                max: clientMax as number,
                                first: clientFirst as number,
                                viewableOnly: viewableOnly as boolean,
                            });
                        }

                        case 'create':
                        case 'add': {
                            const {
                                clientId: newClientId,
                                name,
                                description,
                                enabled = true,
                                publicClient = false,
                                bearerOnly = false,
                                standardFlowEnabled = true,
                                implicitFlowEnabled = false,
                                directAccessGrantsEnabled = true,
                                serviceAccountsEnabled = false,
                                authorizationServicesEnabled = false,
                                protocol = 'openid-connect',
                                attributes,
                                redirectUris,
                                webOrigins,
                                adminUrl,
                                baseUrl,
                                rootUrl,
                            } = handleParams;
                            if (!newClientId)
                                throw _errors['keycloak.missingKey']({key: 'clientId'});

                            return await client.clients.create({
                                clientId: newClientId as string,
                                name: name as string,
                                description: description as string,
                                enabled: enabled as boolean,
                                publicClient: publicClient as boolean,
                                bearerOnly: bearerOnly as boolean,
                                standardFlowEnabled: standardFlowEnabled as boolean,
                                implicitFlowEnabled: implicitFlowEnabled as boolean,
                                directAccessGrantsEnabled: directAccessGrantsEnabled as boolean,
                                serviceAccountsEnabled: serviceAccountsEnabled as boolean,
                                authorizationServicesEnabled:
                                    authorizationServicesEnabled as boolean,
                                protocol: protocol as string,
                                attributes: attributes as Record<string, unknown>,
                                redirectUris: redirectUris as string[],
                                webOrigins: webOrigins as string[],
                                adminUrl: adminUrl as string,
                                baseUrl: baseUrl as string,
                                rootUrl: rootUrl as string,
                            });
                        }

                        case 'update':
                        case 'edit': {
                            const {id: clientUpdateId, ...clientUpdateData} = handleParams;
                            if (!clientUpdateId) throw _errors['keycloak.missingKey']({key: 'id'});
                            return await client.clients.update(
                                {id: clientUpdateId as string},
                                clientUpdateData,
                            );
                        }

                        case 'delete':
                        case 'remove': {
                            const {id: deleteClientId} = handleParams;
                            if (!deleteClientId) throw _errors['keycloak.missingKey']({key: 'id'});
                            return await client.clients.del({id: deleteClientId as string});
                        }

                        case 'secret': {
                            const {id: secretClientId} = handleParams;
                            if (!secretClientId) throw _errors['keycloak.missingKey']({key: 'id'});
                            return await client.clients.getClientSecret({
                                id: secretClientId as string,
                            });
                        }

                        case 'regenerateSecret': {
                            const {id: regenClientId} = handleParams;
                            if (!regenClientId) throw _errors['keycloak.missingKey']({key: 'id'});
                            return await client.clients.generateNewClientSecret({
                                id: regenClientId as string,
                            });
                        }

                        default:
                            throw _errors['keycloak.invalid']();
                    }
                },

                async handleRealmOperations(
                    operation: string,
                    params: unknown[] | Record<string, unknown>,
                    client: KcAdminClient,
                ): Promise<unknown> {
                    const handleParams = Array.isArray(params) ? {} : params;

                    switch (operation) {
                        case 'get': {
                            const {realm} = handleParams;
                            if (!realm) throw _errors['keycloak.missingKey']({key: 'realm'});
                            return await client.realms.findOne({realm: realm as string});
                        }

                        case 'list':
                        case 'find':
                            return await client.realms.find();

                        case 'create':
                        case 'add': {
                            const {
                                realm: newRealm,
                                displayName,
                                enabled = true,
                                ...realmData
                            } = handleParams;
                            if (!newRealm) throw _errors['keycloak.missingKey']({key: 'realm'});
                            return await client.realms.create({
                                realm: newRealm as string,
                                displayName: displayName as string,
                                enabled: enabled as boolean,
                                ...realmData,
                            });
                        }

                        case 'update':
                        case 'edit': {
                            const {realm: updateRealm, ...realmUpdateData} = handleParams;
                            if (!updateRealm) throw _errors['keycloak.missingKey']({key: 'realm'});
                            return await client.realms.update(
                                {realm: updateRealm as string},
                                realmUpdateData,
                            );
                        }

                        case 'delete':
                        case 'remove': {
                            const {realm: deleteRealm} = handleParams;
                            if (!deleteRealm) throw _errors['keycloak.missingKey']({key: 'realm'});
                            return await client.realms.del({realm: deleteRealm as string});
                        }

                        default:
                            throw _errors['keycloak.invalid']();
                    }
                },
            };

            try {
                switch (resourceType.toLowerCase()) {
                    case 'user':
                    case 'users':
                        return await adapter.handleUserOperations(operation, params, client);
                    case 'group':
                    case 'groups':
                        return await adapter.handleGroupOperations(operation, params, client);
                    case 'role':
                    case 'roles':
                        return await adapter.handleRoleOperations(operation, params, client);
                    case 'client':
                    case 'clients':
                        return await adapter.handleClientOperations(operation, params, client);
                    case 'realm':
                    case 'realms':
                        return await adapter.handleRealmOperations(operation, params, client);
                    default:
                        throw _errors['keycloak.invalid']();
                }
            } catch (error: unknown) {
                const keycloakError = error as {
                    response?: {status?: number; data?: {error?: string}};
                };
                if (keycloakError.response?.status === 404) {
                    throw _errors['keycloak.notFound']();
                } else if (keycloakError.response?.status === 401) {
                    throw _errors['keycloak.unauthorized']();
                } else if (keycloakError.response?.status === 403) {
                    throw _errors['keycloak.forbidden']();
                } else if (keycloakError.response?.status === 409) {
                    throw _errors['keycloak.exists']();
                }
                throw _errors['keycloak.generic']();
            }
        },
    };
});
