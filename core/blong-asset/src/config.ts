import {readFileSync} from 'node:fs';
import type {ICachePolicy} from './cache.ts';
import type {IHeaderOptions} from './headers.ts';

/**
 * The options a deployment hands the server as a file, and the reason they travel this way.
 *
 * They are the suite's and the tenant's rather than the process's: a Content-Security-Policy is a
 * statement about what the build loads, a cache policy is a statement about how the build names its
 * files, and both are read by the generator that writes the tree. A JSON document is the form a
 * Kubernetes `ConfigMap` can carry without escaping, and the form a person can read in
 * `kubectl describe configmap` when a page misbehaves in a cluster nobody can open a shell in.
 *
 * A file that is missing is no configuration at all (the defaults answer), while a file that exists
 * and does not parse fails loudly: a generator and a server disagreeing about a policy must never
 * look like a server that simply used its defaults.
 */
export interface IAssetServerConfigFile {
    /** The prefix the bundle answers under (default `/s/`). */
    base?: string;
    /** Security headers, merged over the built-in ones. */
    headers?: IHeaderOptions;
    cache?: ICachePolicy;
    /** Serve the package's own `favicon.ico` and `robots.txt` when the bundle has none. */
    builtIns?: boolean;
    /** Redirect `/` to the bundle's base. Default true. */
    redirectRoot?: boolean;
    /** Answer an unmatched path under the base with `index.html`. Default true. */
    spaFallback?: boolean;
    /** Trust `X-Forwarded-*`, which is what makes HSTS apply behind an ingress. Default true. */
    trustProxy?: boolean;
}

/** Read a configuration document, or nothing when no file was named. */
export const readConfigFile = (file?: string): IAssetServerConfigFile => {
    if (!file) return {};
    let raw: string;
    try {
        raw = readFileSync(file, 'utf8');
    } catch (error) {
        throw new Error(
            `asset server config "${file}" could not be read: ${(error as Error).message}`,
        );
    }
    try {
        const parsed = JSON.parse(raw) as unknown;
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            throw new Error('the document is not a JSON object');
        }
        return parsed as IAssetServerConfigFile;
    } catch (error) {
        throw new Error(
            `asset server config "${file}" is not valid JSON: ${(error as Error).message}`,
        );
    }
};
