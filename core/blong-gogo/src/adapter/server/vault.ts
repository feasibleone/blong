import {adapter, type Errors, type IErrorMap, type IMeta} from '@feasibleone/blong';
import vault from 'node-vault';

export interface IConfig {
    vault: {
        endpoint?: string;
        token?: string;
        apiVersion?: string;
        namespace?: string;
        requestOptions?: object;
        roleId?: string;
        secretId?: string;
        authMethod?: 'token' | 'approle' | 'userpass' | 'ldap';
        username?: string;
        password?: string;
    };
    context: {
        vault: vault.client;
    };
}

const errorMap: IErrorMap = {
    'vault.generic': 'Vault Error',
    'vault.invalid': 'Invalid Vault Operation',
    'vault.notFound': 'Vault Secret Not Found',
    'vault.unauthorized': 'Vault Unauthorized',
    'vault.forbidden': 'Vault Access Forbidden',
    'vault.missingKey': 'Missing key value for {key}',
    'vault.missingPath': 'Missing secret path',
    'vault.authFailed': 'Vault authentication failed',
};

let _errors: Errors<typeof errorMap>;

async function authenticateVault(this: {config: IConfig}): Promise<void> {
    const {authMethod, roleId, secretId, username, password} = this.config.vault;

    try {
        switch (authMethod) {
            case 'approle': {
                if (!roleId || !secretId)
                    throw _errors['vault.missingKey']({key: 'roleId or secretId'});
                const result = await this.config.context.vault.approleLogin({
                    role_id: roleId,
                    secret_id: secretId,
                });
                this.config.context.vault.token = result.auth.client_token;
                break;
            }
            case 'userpass': {
                if (!username || !password)
                    throw _errors['vault.missingKey']({key: 'username or password'});
                const result = await this.config.context.vault.userpassLogin({
                    username,
                    password,
                });
                this.config.context.vault.token = result.auth.client_token;
                break;
            }
            case 'ldap': {
                if (!username || !password)
                    throw _errors['vault.missingKey']({key: 'username or password'});
                const result = await this.config.context.vault.ldapLogin({
                    username,
                    password,
                });
                this.config.context.vault.token = result.auth.client_token;
                break;
            }
            default:
                throw _errors['vault.authFailed']();
        }
    } catch (error) {
        throw _errors['vault.authFailed']();
    }
}

export default adapter<IConfig>(({utError}) => {
    _errors ||= utError.register(errorMap);

    return {
        async init(...configs: object[]) {
            await super.init(
                {
                    type: 'vault',
                },
                ...configs
            );
        },
        async start() {
            const vaultOptions = {
                endpoint: this.config.vault.endpoint || 'http://127.0.0.1:8200',
                token: this.config.vault.token,
                apiVersion: this.config.vault.apiVersion || 'v1',
                namespace: this.config.vault.namespace,
                requestOptions: this.config.vault.requestOptions || {},
            };

            this.config.context = {vault: vault(vaultOptions)};

            // Handle authentication if not using token directly
            if (!this.config.vault.token && this.config.vault.authMethod) {
                await authenticateVault.call(this);
            }

            super.connect();
            return super.start();
        },
        async stop(...params: unknown[]) {
            let result;
            try {
                // Revoke token if we authenticated
                if (this.config.context?.vault?.token && this.config.vault.authMethod) {
                    await this.config.context.vault.tokenRevokeSelf();
                }
            } catch {
                // Ignore revocation errors during shutdown
            } finally {
                this.config.context = null;
                result = await super.stop(...params);
            }
            return result;
        },
        async exec(
            params:
                | ({
                      path?: string;
                      data?: Record<string, unknown>;
                      mount_point?: string;
                      type?: string;
                      description?: string;
                      config?: Record<string, unknown>;
                      version?: number;
                      metadata?: Record<string, unknown>;
                  } & Record<string, unknown>)
                | unknown[],
            {method}: IMeta
        ) {
            const [, resource, operation] = method.split('.');
            let secretPath = resource;
            let actualParams = params;

            if (!Array.isArray(params) && params.path) {
                secretPath = params.path;
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                const {path: _pathParam, ...rest} = params;
                actualParams = rest;
            }

            switch (operation) {
                case 'read':
                case 'get': {
                    // Read secret from Vault
                    if (Array.isArray(actualParams)) throw _errors['vault.invalid']();
                    if (!secretPath) throw _errors['vault.missingPath']();

                    try {
                        const result = await this.config.context.vault.read(secretPath);
                        return result.data;
                    } catch (error: unknown) {
                        if (
                            (error as {response?: {statusCode?: number}})?.response?.statusCode ===
                            404
                        ) {
                            throw _errors['vault.notFound']();
                        }
                        throw _errors['vault.generic']();
                    }
                }
                case 'write':
                case 'put': {
                    // Write secret to Vault
                    if (Array.isArray(actualParams)) throw _errors['vault.invalid']();
                    if (!secretPath) throw _errors['vault.missingPath']();

                    const {data, metadata} = actualParams;
                    if (!data) throw _errors['vault.missingKey']({key: 'data'});

                    try {
                        const writeParams = metadata ? {data, metadata} : data;
                        return await this.config.context.vault.write(secretPath, writeParams);
                    } catch (error: unknown) {
                        throw _errors['vault.generic']();
                    }
                }
                case 'delete':
                case 'remove': {
                    // Delete secret from Vault
                    if (Array.isArray(actualParams)) throw _errors['vault.invalid']();
                    if (!secretPath) throw _errors['vault.missingPath']();

                    const {version} = actualParams;

                    try {
                        if (version !== undefined) {
                            // Delete specific version for KV v2
                            return await this.config.context.vault.delete(`${secretPath}`, {
                                versions: [version],
                            });
                        } else {
                            // Delete latest version or entire secret
                            return await this.config.context.vault.delete(secretPath);
                        }
                    } catch (error: unknown) {
                        throw _errors['vault.generic']();
                    }
                }
                case 'list': {
                    // List secrets at path
                    if (Array.isArray(actualParams)) throw _errors['vault.invalid']();
                    if (!secretPath) throw _errors['vault.missingPath']();

                    try {
                        const result = await this.config.context.vault.list(secretPath);
                        return result.data;
                    } catch (error: unknown) {
                        if (
                            (error as {response?: {statusCode?: number}})?.response?.statusCode ===
                            404
                        ) {
                            return {keys: []};
                        }
                        throw _errors['vault.generic']();
                    }
                }
                case 'mount': {
                    // Mount secret engine
                    if (Array.isArray(actualParams)) throw _errors['vault.invalid']();
                    const {mount_point, type, description, config} = actualParams;
                    if (!mount_point) throw _errors['vault.missingKey']({key: 'mount_point'});
                    if (!type) throw _errors['vault.missingKey']({key: 'type'});

                    try {
                        return await this.config.context.vault.mount({
                            mount_point,
                            type,
                            description,
                            config,
                        });
                    } catch (error: unknown) {
                        throw _errors['vault.generic']();
                    }
                }
                case 'unmount': {
                    // Unmount secret engine
                    if (Array.isArray(actualParams)) throw _errors['vault.invalid']();
                    const {mount_point} = actualParams;
                    if (!mount_point) throw _errors['vault.missingKey']({key: 'mount_point'});

                    try {
                        return await this.config.context.vault.unmount({mount_point});
                    } catch (error: unknown) {
                        throw _errors['vault.generic']();
                    }
                }
                case 'health': {
                    // Check Vault health
                    try {
                        return await this.config.context.vault.health();
                    } catch (error: unknown) {
                        throw _errors['vault.generic']();
                    }
                }
                case 'status': {
                    // Get Vault status
                    try {
                        return await this.config.context.vault.status();
                    } catch (error: unknown) {
                        throw _errors['vault.generic']();
                    }
                }
            }
            throw _errors['vault.generic']();
        },
    };
});
