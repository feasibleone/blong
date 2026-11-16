import type {IBlobMeta} from '@feasibleone/blong';
import {library} from '@feasibleone/blong';

/** One entry as `cacache`'s index reports it, narrowed to the fields the store reads. */
export interface IStorageEntry {
    key: string;
    size?: number;
    time?: number;
    metadata?: unknown;
}

/**
 * Where one namespace's files live, refusing a namespace the configuration does not name.
 *
 * The directory is the mount a consuming realm declared, so the store never invents a path: writing
 * into a directory nobody claimed is how a blob ends up in a container that disappears with the pod
 * (@@D-845).
 */
export function storageDirectoryOf(config: Record<string, unknown>, namespace: string): string {
    const configured = config?.namespaces ?? {};
    if (!Object.prototype.hasOwnProperty.call(configured, namespace)) {
        throw Object.assign(
            new Error(
                `blob: namespace "${namespace}" is not configured — ` +
                    'name it under blob.storage.namespaces',
            ),
            {type: 'blob.namespaceUnknown', namespace},
        );
    }
    return `${((config.directory as string) ?? '/var/lib/blong/blob').replace(/\/+$/, '')}/${namespace}`;
}

/** One metadata record, merged over another, with the fields a reader counts on defaulted. */
export function storageMetaMerge(base: IBlobMeta, patch: Partial<IBlobMeta> = {}): IBlobMeta {
    return {
        ...base,
        ...patch,
        scopes: patch.scopes ?? base.scopes,
        scopeMode: patch.scopeMode ?? base.scopeMode ?? 'any',
    };
}

/**
 * One index entry as `IBlobMeta`.
 *
 * An index written by an older build may hold fewer fields than the current shape names, and a record
 * that lost its scope list must not read as public: every default here is the refusing end (@@D-837).
 */
export function storageMetaFromEntry(namespace: string, entry: IStorageEntry): IBlobMeta {
    const stored = (entry.metadata ?? {}) as Partial<IBlobMeta>;
    return {
        key: entry.key,
        namespace,
        contentType: stored.contentType ?? 'application/octet-stream',
        size: typeof stored.size === 'number' ? stored.size : (entry.size ?? 0),
        digest: stored.digest ?? '',
        createdAt: stored.createdAt ?? new Date(entry.time ?? Date.now()).toISOString(),
        createdBy: stored.createdBy,
        scopes: Array.isArray(stored.scopes) ? stored.scopes : [],
        scopeMode: stored.scopeMode === 'all' ? 'all' : 'any',
        state: stored.state === 'stored' ? 'stored' : 'pending',
        temporary: stored.temporary === true,
        expiresAt: stored.expiresAt ?? null,
        originalFilename: stored.originalFilename,
        cacheControl: stored.cacheControl,
        crypto: stored.crypto ?? null,
        variants: stored.variants,
    };
}

/** What the `adapter/storage` group injects. */
export interface IStorageLib {
    storageDirectory: (config: Record<string, unknown>, namespace: string) => string;
    storageMetaMerge: (base: IBlobMeta, patch?: Partial<IBlobMeta>) => IBlobMeta;
    storageMetaFromEntry: (namespace: string, entry: IStorageEntry) => IBlobMeta;
}

/** `storageLib` — the group's helpers, bound to the adapter's own configuration. */
export default library(() => ({
    storageDirectory: (config: Record<string, unknown>, namespace: string) =>
        storageDirectoryOf(config, namespace),
    storageMetaMerge,
    storageMetaFromEntry,
}));
