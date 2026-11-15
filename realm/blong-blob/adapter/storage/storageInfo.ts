import {handler} from './handlerGroup.ts';

/**
 * What this backend can do, as a caller decides with it.
 *
 * The filesystem store streams both ways and hands a `Range` request to the serving layer, which slices
 * the stream itself (@@D-838). Its metadata is the cache's own index entry, so it imposes no ceiling a
 * caller has to know about.
 */
export interface IStorageInfo {
    backend: string;
    /** Whether a body passes through as a stream rather than being held whole. */
    streams: boolean;
    /** Whether a read may start in the middle of a blob. */
    ranges: boolean;
    /** The largest record the backend stores, or `null` when it imposes none. */
    metadataCeiling: number | null;
    /** The last failure the backend recorded, when it records them. */
    lastFailure?: {at: string; reason: string} | null;
}

export default handler(() => ({
    async storageInfo(): Promise<IStorageInfo> {
        return {
            backend: 'cacache',
            streams: true,
            ranges: true,
            metadataCeiling: null,
        };
    },
}));
