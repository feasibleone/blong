import {handler} from './handlerGroup.ts';

/**
 * `storage.blob.namespace.find` — the namespaces this process serves.
 *
 * The list lives in the backend's configuration (`blob.storage.namespaces`), because that is where a
 * namespace becomes a directory, and a caller that has to sweep every namespace cannot guess it: a
 * suite names its realms' namespaces after the realms, and a deployment may add one without the
 * caller knowing (@@D-845).
 */
export default handler(() => ({
    async storageBlobNamespaceFind(): Promise<{namespaces: string[]}> {
        const configured = (this.config as {namespaces?: Record<string, unknown>} | undefined)
            ?.namespaces;
        return {namespaces: Object.keys(configured ?? {}).sort()};
    },
}));
