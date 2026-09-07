import {adapter, type Errors, type IErrorMap, type IMeta} from '@feasibleone/blong/types';
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
        vault?: vault.client;
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

// KV v2 secret-engine mount paths (trailing slash, e.g. `secret/`), discovered
// from `vault.mount.list`. KV v2 stores the actual secrets under `metadata/`
// (listing) / `data/` (reading) instead of the mount root.
const kv2Mounts = new Set<string>();

/** Collapse doubled separators from `{parent.path}/{key}` joins. */
function normalizePath(path: string): string {
    return path.replace(/\/{2,}/g, '/');
}

/** The KV v2 mount a path belongs to (e.g. `secret/`), or null. */
function kv2MountFor(path: string): string | null {
    const normalized = normalizePath(path);
    for (const mount of kv2Mounts) {
        if (normalized === mount || normalized.startsWith(mount)) return mount;
    }
    return null;
}

async function authenticateVault(this: {config: IConfig}): Promise<void> {
    const {authMethod, roleId, secretId, username, password} = this.config.vault;

    try {
        switch (authMethod) {
            case 'approle': {
                if (!roleId || !secretId)
                    throw _errors['vault.missingKey']({key: 'roleId or secretId'});
                const result = await this.config.context.vault!.approleLogin({
                    role_id: roleId,
                    secret_id: secretId,
                });
                this.config.context.vault!.token = result.auth.client_token;
                break;
            }
            case 'userpass': {
                if (!username || !password)
                    throw _errors['vault.missingKey']({key: 'username or password'});
                const result = await this.config.context.vault!.userpassLogin({
                    username,
                    password,
                });
                this.config.context.vault!.token = result.auth.client_token;
                break;
            }
            case 'ldap': {
                if (!username || !password)
                    throw _errors['vault.missingKey']({key: 'username or password'});
                const result = await this.config.context.vault!.ldapLogin({
                    username,
                    password,
                });
                this.config.context.vault!.token = result.auth.client_token;
                break;
            }
            default:
                throw _errors['vault.authFailed']();
        }
    } catch (error) {
        throw _errors['vault.authFailed'](error);
    }
}

export default adapter<IConfig>(({utError}) => {
    _errors ||= utError.register(errorMap);

    return {
        activation: {
            default: {
                type: 'vault',
            },
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
                    await this.config.context.vault!.tokenRevokeSelf();
                }
            } catch {
                // Ignore revocation errors during shutdown
            } finally {
                this.config.context = {};
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
            $meta: IMeta,
        ) {
            const {method} = $meta;
            const [, resource, operation] = method!.split('.');
            let secretPath = resource;
            let actualParams = params;

            if (!Array.isArray(params) && params.path) {
                secretPath = params.path;
                const {path: _pathParam, ...rest} = params;
                actualParams = rest;
            }

            switch (operation) {
                case 'read':
                case 'get': {
                    // Read secret from Vault
                    if (Array.isArray(actualParams)) {
                        throw this.error(_errors['vault.invalid'](), $meta);
                    }
                    if (!secretPath) {
                        throw this.error(_errors['vault.missingPath'](), $meta);
                    }

                    // KV v2: secrets are read from `<mount>data/<name>`, and the
                    // secret fields are wrapped under `data`.
                    let readPath = normalizePath(secretPath);
                    const mount = kv2MountFor(readPath);
                    if (mount && !readPath.startsWith(`${mount}data/`)) {
                        const name = readPath.slice(mount.length);
                        readPath = `${mount}data/${name}`;
                    }

                    try {
                        const result = await this.config.context.vault!.read(readPath);
                        const payload = result.data;
                        if (
                            payload &&
                            typeof payload === 'object' &&
                            !Array.isArray(payload) &&
                            'data' in payload
                        ) {
                            return (payload as {data: unknown}).data;
                        }
                        return payload;
                    } catch (error: unknown) {
                        throw this.error(
                            (error as {response?: {statusCode?: number}})?.response?.statusCode === 404
                                ? _errors['vault.notFound'](error)
                                : _errors['vault.generic'](error),
                            $meta,
                        );
                    }
                }
                case 'write':
                case 'put': {
                    // Write secret to Vault
                    if (Array.isArray(actualParams)) {
                        throw this.error(_errors['vault.invalid'](), $meta);
                    }
                    if (!secretPath) {
                        throw this.error(_errors['vault.missingPath'](), $meta);
                    }

                    const {data, metadata} = actualParams;
                    if (!data) {
                        throw this.error(_errors['vault.missingKey']({key: 'data'}), $meta);
                    }

                    try {
                        const writeParams = metadata ? {data, metadata} : data;
                        return await this.config.context.vault!.write(secretPath, writeParams);
                    } catch (error: unknown) {
                        throw this.error(_errors['vault.generic'](error), $meta);
                    }
                }
                case 'delete':
                case 'remove': {
                    // Delete secret from Vault
                    if (Array.isArray(actualParams)) {
                        throw this.error(_errors['vault.invalid'](), $meta);
                    }
                    if (!secretPath) {
                        throw this.error(_errors['vault.missingPath'](), $meta);
                    }

                    const {version} = actualParams;

                    try {
                        if (version !== undefined) {
                            // Delete specific version for KV v2
                            return await this.config.context.vault!.delete(`${secretPath}`, {
                                versions: [version],
                            });
                        } else {
                            // Delete latest version or entire secret
                            return await this.config.context.vault!.delete(secretPath);
                        }
                    } catch (error: unknown) {
                        throw this.error(_errors['vault.generic'](error), $meta);
                    }
                }
                case 'list': {
                    // List secrets at path
                    if (Array.isArray(actualParams)) {
                        throw this.error(_errors['vault.invalid'](), $meta);
                    }
                    // `vault.mount.list` — enumerate mounted secret engines
                    if (resource === 'mount') {
                        try {
                            const result = await this.config.context.vault!.mounts();
                            kv2Mounts.clear();
                            const items = Object.entries(result?.data ?? {}).map(
                                ([path, cfg]: [string, unknown]) => {
                                    const c = cfg as {
                                        type?: string;
                                        options?: {version?: number};
                                    };
                                    if (c?.type === 'kv' && (c.options?.version ?? 0) === 2) {
                                        kv2Mounts.add(path);
                                    }
                                    return {
                                        path,
                                        ...(typeof cfg === 'object' && cfg !== null
                                            ? (cfg as Record<string, unknown>)
                                            : {}),
                                    };
                                },
                            );
                            return {items};
                        } catch (error: unknown) {
                            throw this.error(_errors['vault.generic'](error), $meta);
                        }
                    }
                    if (!secretPath) {
                        throw this.error(_errors['vault.missingPath'](), $meta);
                    }

                    // KV v2: a mount root (or its `data/` marker) lists the actual
                    // secrets through `metadata/` — never the raw mount root.
                    const originalPath = normalizePath(secretPath);
                    let listPath = originalPath;
                    const mount = kv2MountFor(listPath);
                    if (mount) {
                        const trimmedMount = mount.replace(/\/+$/, '');
                        const trimmedList = listPath.replace(/\/+$/, '');
                        if (trimmedList === trimmedMount || trimmedList === `${trimmedMount}/data`) {
                            listPath = `${trimmedMount}/metadata/`;
                        }
                    }

                    try {
                        const result = await this.config.context.vault!.list(listPath);
                        const data = (result.data ?? {}) as {keys?: string[]};
                        // Keep the native Vault `keys` shape (relied on by the
                        // integration tests) and additionally expose commander-style
                        // `items` rows (consistent with `vault.mount.list`) so the
                        // generic explorer can render the secrets as a table. Keys
                        // ending in `/` are sub-path (directory) markers, not leaf
                        // secrets — clicking one would 404 ("Vault Secret Not
                        // Found"), so they are filtered out. Rows carry the MOUNT
                        // path so the deeper level's `{parent.path}/{key}` open
                        // resolves to `<mount>/<name>`.
                        const keys = (data.keys ?? []).filter(key => !key.endsWith('/'));
                        return {
                            ...data,
                            keys,
                            items: keys.map(key => ({key, path: originalPath})),
                        };
                    } catch (error: unknown) {
                        if (
                            (error as {response?: {statusCode?: number}})?.response?.statusCode ===
                            404
                        ) {
                            return {keys: [], items: []};
                        }
                        throw this.error(_errors['vault.generic'](error), $meta);
                    }
                }
                case 'mount': {
                    // Mount secret engine
                    if (Array.isArray(actualParams)) {
                        throw this.error(_errors['vault.invalid'](), $meta);
                    }
                    const {mount_point, type, description, config} = actualParams;
                    if (!mount_point) {
                        throw this.error(_errors['vault.missingKey']({key: 'mount_point'}), $meta);
                    }
                    if (!type) {
                        throw this.error(_errors['vault.missingKey']({key: 'type'}), $meta);
                    }

                    try {
                        return await this.config.context.vault!.mount({
                            mount_point,
                            type,
                            description,
                            config,
                        });
                    } catch (error: unknown) {
                        throw this.error(_errors['vault.generic'](error), $meta);
                    }
                }
                case 'unmount': {
                    // Unmount secret engine
                    if (Array.isArray(actualParams)) {
                        throw this.error(_errors['vault.invalid'](), $meta);
                    }
                    const {mount_point} = actualParams;
                    if (!mount_point) {
                        throw this.error(_errors['vault.missingKey']({key: 'mount_point'}), $meta);
                    }

                    try {
                        return await this.config.context.vault!.unmount({mount_point});
                    } catch (error: unknown) {
                        throw this.error(_errors['vault.generic'](error), $meta);
                    }
                }
                case 'health': {
                    // Check Vault health
                    try {
                        return await this.config.context.vault!.health();
                    } catch (error: unknown) {
                        throw this.error(_errors['vault.generic'](error), $meta);
                    }
                }
                case 'status': {
                    // Get Vault status
                    try {
                        return await this.config.context.vault!.status();
                    } catch (error: unknown) {
                        throw this.error(_errors['vault.generic'](error), $meta);
                    }
                }
            }
            throw this.error(_errors['vault.generic']({}), $meta);
        },
    };
});
