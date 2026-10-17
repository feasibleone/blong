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

/**
 * The parameters as a row carries them.
 *
 * `access_credential.credentialParamsJSON` is a `stringNull` column, so the
 * database hands back the JSON **text** — the knex adapter converts only binary
 * columns. Accepting a string here is what makes a stored credential verify
 * with the parameters that produced it, instead of falling back to `config`
 * (F-553: a database whose rows were hashed under other parameters stopped
 * authenticating after the config's iterations changed, while a fresh database
 * passed for the wrong reason).
 */
export type StoredCredentialParams = Partial<CredentialParams> | string | null | undefined;

type KnexQb = any;

/**
 * Parse a stored parameter document, tolerating what the column returns.
 *
 * `string` is the ordinary case (a `stringNull` column carries JSON text) and an
 * object is what a JSON-typed column or a caller hands over. A document that does
 * not parse is treated as absent, so the config fallback still decides rather than
 * verification throwing on a corrupt row.
 */
function readParams(source: StoredCredentialParams): Partial<CredentialParams> | null {
    if (source === null || source === undefined) return null;
    if (typeof source !== 'string') return source;
    try {
        const parsed: unknown = JSON.parse(source);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
            ? (parsed as Partial<CredentialParams>)
            : null;
    } catch {
        return null;
    }
}

/**
 * Credential-function helpers for the access realm.
 *
 * Parameters resolve as: explicit source (e.g. the active `access.policy` for
 * the credential type) → `config.password` (fallback defaults declared in the
 * suite server config) → built-in literals.  The resolved parameters (including
 * the function name) are stored on the credential row as JSON so verification
 * always re-uses the exact parameters that produced the secret.
 */
/**
 * The credential-function helpers as a handler sees them, destructured from
 * `lib`: `handler(({lib: {verifyPassword}}) => …)`.
 */
export type PasswordLib = {
    /** Resolve credential params from a source (e.g. access policy) with config fallback. */
    resolveCredentialParams(source?: StoredCredentialParams): PasswordParams;
    /** Hash a password with the given (or default) params. */
    hashPassword(
        password: string,
        salt: string,
        source?: StoredCredentialParams,
    ): {hash: string; params: PasswordParams};
    /** Constant-compare a password against a stored hash using the stored params. */
    verifyPassword(
        password: string,
        hash: string,
        salt: string,
        params?: StoredCredentialParams,
    ): boolean;
    /** Read the active policy's credential parameters for a credential type. */
    credentialPolicyParams(
        qb: KnexQb,
        credentialType: string,
    ): Promise<Partial<CredentialParams> | null>;
};

export default library(({config}): PasswordLib => {
    const defaults = (config?.password ?? {}) as Partial<PasswordParams>;
    const resolve = (source?: StoredCredentialParams): PasswordParams => {
        const stored = readParams(source);
        return {
            function: (stored?.function as string | undefined) ?? defaults.function ?? 'hash',
            algorithm: (stored?.algorithm as string | undefined) ?? defaults.algorithm ?? 'pbkdf2',
            iterations: (stored?.iterations as number | undefined) ?? defaults.iterations ?? 100000,
            keyLength: (stored?.keyLength as number | undefined) ?? defaults.keyLength ?? 64,
            digest: (stored?.digest as string | undefined) ?? defaults.digest ?? 'sha512',
        };
    };

    return {
        /** Resolve credential params from a source (e.g. access policy) with config fallback. */
        resolveCredentialParams(source?: StoredCredentialParams): PasswordParams {
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
            source?: StoredCredentialParams,
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
            params?: StoredCredentialParams,
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
});
