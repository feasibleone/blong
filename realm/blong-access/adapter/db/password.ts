import crypto from 'node:crypto';

import {library} from '@feasibleone/blong';

/**
 * Generic parameters for a credential function.  `function` names the algorithm
 * that derives/verifies the credential secret (currently only `hash` is
 * implemented; future functions — e.g. TOTP — add their own params alongside).
 * Stored as a JSON document in `access_credential.credentialParamsJSON`.
 */
export type CredentialParams = {
    function: string;
} & Record<string, unknown>;

/** Parameters for the `hash` credential function (PBKDF2). */
export type PasswordParams = CredentialParams & {
    algorithm: string;
    iterations: number;
    keyLength: number;
    digest: string;
};

type KnexQb = any;

/**
 * Credential-function helpers for the access realm.
 *
 * Parameters resolve as: explicit source (e.g. the active `access.policy` for
 * the credential type) → `config.password` (fallback defaults declared in the
 * suite server config) → built-in literals.  The resolved parameters (including
 * the function name) are stored on the credential row as JSON so verification
 * always re-uses the exact parameters that produced the secret.
 */
export default library(
    ({config}) => {
        const defaults = (config?.password ?? {}) as Partial<PasswordParams>;
        const resolve = (source?: Partial<CredentialParams> | null): PasswordParams => ({
            function: (source?.function as string | undefined) ?? defaults.function ?? 'hash',
            algorithm: (source?.algorithm as string | undefined) ?? defaults.algorithm ?? 'pbkdf2',
            iterations:
                (source?.iterations as number | undefined) ?? defaults.iterations ?? 100000,
            keyLength: (source?.keyLength as number | undefined) ?? defaults.keyLength ?? 64,
            digest: (source?.digest as string | undefined) ?? defaults.digest ?? 'sha512',
        });

        return {
            /** Resolve credential params from a source (e.g. access policy) with config fallback. */
            resolveCredentialParams(source?: Partial<CredentialParams> | null): PasswordParams {
                return resolve(source);
            },

            /**
             * Hash a password with the given (or default) params.
             * Returns the hex hash plus the full params used (function + hash
             * params), so callers can persist them as the credential's JSON
             * parameters for later verification.
             */
            hashPassword(
                password: string,
                salt: string,
                source?: Partial<CredentialParams> | null,
            ): {hash: string; params: PasswordParams} {
                const params = resolve(source);
                if (params.function !== 'hash' || params.algorithm !== 'pbkdf2') {
                    throw new Error(
                        `Unsupported credential function/algorithm: ${params.function}/${params.algorithm}`,
                    );
                }
                const hash = crypto
                    .pbkdf2Sync(password, salt, params.iterations, params.keyLength, params.digest)
                    .toString('hex');
                return {hash, params};
            },

            /** Constant-compare a password against a stored hash using the stored (or default) params. */
            verifyPassword(
                password: string,
                hash: string,
                salt: string,
                params?: Partial<CredentialParams> | null,
            ): boolean {
                const p = resolve(params);
                if (p.function !== 'hash' || p.algorithm !== 'pbkdf2') return false;
                const derivedKey = crypto.pbkdf2Sync(
                    password,
                    salt,
                    p.iterations,
                    p.keyLength,
                    p.digest,
                );
                return derivedKey.toString('hex') === hash;
            },

            /**
             * Read the active policy's credential parameters for a credential
             * type.  The `credentialParamsJSON` column is a `*JSON` column, so
             * the knex adapter parses it into an object automatically; a raw
             * string is also tolerated for unwrapped builders.  Returns null
             * when no policy (or no parameters) is configured, letting callers
             * fall back to `config.password`.
             */
            async credentialPolicyParams(
                qb: KnexQb,
                credentialType: string,
            ): Promise<Partial<CredentialParams> | null> {
                const row = await qb
                    .select('credentialParamsJSON')
                    .from('access_policy')
                    .where('credentialType', credentialType)
                    .where('isActive', 1)
                    .first();
                if (!row?.credentialParamsJSON) return null;
                let params: unknown = row.credentialParamsJSON;
                if (typeof params === 'string') {
                    try {
                        params = JSON.parse(params);
                    } catch {
                        return null;
                    }
                }
                return params && typeof params === 'object' && !Array.isArray(params)
                    ? (params as Partial<CredentialParams>)
                    : null;
            },
        };
    },
);
