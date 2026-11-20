/**
 * lukaot — what only a node process can use, on top of the whole shared surface.
 *
 * The split exists because the root is bundled for a page as well as for a process (`@@T-732`): a
 * logger that hands lines to a writer and a cache that keeps them on disk both open a filesystem, and
 * a bundler that follows either into a browser page stops at the first `node:` import it cannot
 * resolve. So the root stays free of them and this entry re-exports it whole beside them — one
 * declaration, so a server imports this and has everything, exactly as before the split.
 *
 * `fingerprint.ts` travels with the logger rather than with the root for the same reason: it hashes
 * with `node:crypto`, and the only caller is the record the logger writes.
 */
export * from './index.ts';
export {
    /**
     * The ids a store directory holds, read without opening it for writing.
     *
     * What the inspect side needs and a logger does not: `lukaot inspect` resolves
     * one reference, and a tool that answers "what is in this store" has to list it
     * before it can resolve anything (`@@T-718`).
     */
    cacheRecordIds,
    openCache,
    type CacheOptions,
    type PayloadReader,
    type PayloadStore,
    type RecordCache,
    type RecordStore,
} from './src/cache.ts';
export {
    captureProcessFailures,
    createLogger,
    type Format,
    type Logger,
    type LoggerOptions,
} from './src/logger.ts';
export {
    /**
     * The batch format itself, so a collector reads it from the definition that writes it.
     */
    createBatchId,
    createPacketHeader,
    HEADER_SIZE,
    sendBatch,
    splitPayload,
    type IBatchTarget,
} from './src/packets.ts';
export {
    /**
     * The framework's own sink: records over UDP, in the batch format a collector reassembles.
     *
     * A process has to be able to send its records somewhere without depending on the tool that shows
     * them, so the common destination ships here and `log.destination` names it by address alone
     * (`@@D-930`).
     */
    createUdpWriter,
    type IUdpWriter,
    type IUdpWriterOptions,
} from './src/udpWriter.ts';
