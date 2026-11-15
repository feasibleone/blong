import {library} from '@feasibleone/blong';

import type {IBlobMeta, IMeta} from '@feasibleone/blong';
import type {IS3StoreConfig} from '../s3Store.ts';
import {storageMetaFromEntry, type IStorageEntry} from '../storage/storageLib.ts';

/** The suffix that says an object is a blob's record rather than a blob. */
export const S3_META_SUFFIX = '.meta.json';

/**
 * Where a blob's bytes and its record sit in the bucket.
 *
 * A bucket has no directories, so the namespace is the first segment of the key and the prefix is
 * whatever the deployment owns — one bucket may hold several suites, and a suite's keys must not be able
 * to collide with another's (@@D-845). The record is a second object beside the first, because an S3
 * object's own metadata is a flat map of short strings and cannot carry the shape a blob record has.
 */
function prefixOf(config: IS3StoreConfig): string {
    const raw = (config?.prefix ?? '').replace(/^\/+|\/+$/g, '');
    return raw ? `${raw}/` : '';
}

export function s3StoreContentKeyOf(
    config: IS3StoreConfig,
    namespace: string,
    key: string,
): string {
    return `${prefixOf(config)}${namespace}/${key}`;
}

/** The record that describes one blob, stored beside it. */
export function s3StoreMetaKeyOf(
    config: IS3StoreConfig,
    namespace: string,
    key: string,
): string {
    return `${s3StoreContentKeyOf(config, namespace, key)}${S3_META_SUFFIX}`;
}

/** Where one namespace's keys start, which is the prefix a listing is narrowed to. */
export function s3StoreNamespacePrefixOf(config: IS3StoreConfig, namespace: string): string {
    return `${prefixOf(config)}${namespace}/`;
}

/** Refuse a namespace the configuration does not name — writing into nobody's namespace is a bug. */
export function s3StoreNamespaceCheck(config: IS3StoreConfig, namespace: string): void {
    if (!Object.prototype.hasOwnProperty.call(config?.namespaces ?? {}, namespace)) {
        throw Object.assign(
            new Error(
                `blob: namespace "${namespace}" is not configured — ` +
                    'name it under blob.s3Store.namespaces',
            ),
            {type: 'blob.namespaceUnknown', namespace},
        );
    }
}

/**
 * One record, read from its sidecar.
 *
 * The sidecar is written by this realm, but a bucket is a place other tools write too: a body that is
 * not the JSON this realm wrote answers `null` instead of a record with invented fields, and the same
 * defaults the filesystem store applies are applied here (@@D-837).
 */
export function s3StoreMetaParse(
    body: Uint8Array | Buffer | undefined,
    namespace: string,
    key: string,
    size?: number,
): IBlobMeta | null {
    if (!body) return null;
    let record: unknown;
    try {
        record = JSON.parse(Buffer.from(body).toString('utf8'));
    } catch {
        return null;
    }
    if (!record || typeof record !== 'object' || Array.isArray(record)) return null;
    const entry: IStorageEntry = {
        key,
        size,
        metadata: record,
    };
    return {...storageMetaFromEntry(namespace, entry), key, namespace};
}

/**
 * The operations of the framework's `s3` adapter, reachable on this port.
 *
 * The group lives on the same port as the client (`extends: 'adapter.s3'`), so its handlers reach the
 * object operations through `exec` rather than through a second adapter: one port, one client, and the
 * method it is handed names the operation (`storage.object.add`) without ever being routed.
 */
export interface IS3StorePort {
    exec: (params: object, $meta: IMeta) => Promise<unknown>;
}

/** What a backend says about a failure, kept where a probe can read it after the fact. */
export interface IStoreFailure {
    at: string;
    reason: string;
}

/**
 * Remember the last failure this port saw.
 *
 * A probe asks what is wrong with storage, and the answer is worth having even though the failed call
 * has already answered its own caller: the adapter's context outlives the request, so the next `info`
 * read names what went wrong and when (@@D-838). Only the message is kept — a stack from a request nobody
 * is serving any more is noise.
 */
export function noteFailure(context: unknown, error: unknown): void {
    const target = context as {lastFailure?: IStoreFailure} | undefined;
    if (!target) return;
    target.lastFailure = {
        at: new Date().toISOString(),
        reason: String((error as Error)?.message ?? error),
    };
}

/** What the `adapter/s3` group injects. */
export interface IS3StoreLib {
    s3StoreContentKey: (namespace: string, key: string) => string;
    s3StoreMetaKey: (namespace: string, key: string) => string;
    s3StoreNamespacePrefix: (namespace: string) => string;
    s3StoreNamespaceCheck: (namespace: string) => void;
    s3StoreMetaSerialize: (meta: IBlobMeta) => Buffer;
    s3StoreMetaParse: (
        body: Uint8Array | Buffer | undefined,
        namespace: string,
        key: string,
        size?: number,
    ) => IBlobMeta | null;
    /**
     * One object operation on this port, with the failure kept where `storage.info` can report it.
     *
     * Every read and write in this group goes through here, so a probe sees the last thing that went
     * wrong without a second copy of the same `try`/`catch` in six handlers (@@D-838).
     */
    s3StoreExec: (
        port: IS3StorePort,
        params: object,
        $meta: IMeta,
        operation: 'add' | 'get' | 'stream' | 'head' | 'remove' | 'find',
    ) => Promise<unknown>;
}

/** `s3StoreLib` — the group's helpers, bound to this adapter's own configuration. */
export default library(({config}: {config: IS3StoreConfig}) => ({
    s3StoreContentKey: (namespace: string, key: string) =>
        s3StoreContentKeyOf(config, namespace, key),
    s3StoreMetaKey: (namespace: string, key: string) => s3StoreMetaKeyOf(config, namespace, key),
    s3StoreNamespacePrefix: (namespace: string) => s3StoreNamespacePrefixOf(config, namespace),
    s3StoreNamespaceCheck: (namespace: string) => s3StoreNamespaceCheck(config, namespace),
    s3StoreMetaSerialize: (meta: IBlobMeta) => Buffer.from(JSON.stringify(meta), 'utf8'),
    s3StoreMetaParse,
    noteFailure,
    s3StoreExec: async (
        port: IS3StorePort,
        params: object,
        $meta: IMeta,
        operation: 'add' | 'get' | 'stream' | 'head' | 'remove' | 'find',
    ): Promise<unknown> => {
        try {
            return await port.exec(params, {...$meta, method: `storage.object.${operation}`} as IMeta);
        } catch (error) {
            noteFailure(
                (port as unknown as {config?: {context?: unknown}}).config?.context,
                error,
            );
            throw error;
        }
    },
}));
