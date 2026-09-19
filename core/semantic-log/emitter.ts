/**
 * semantic-log — emitter surface.
 *
 * Everything a process needs to *produce* records: the logger, the ambient
 * context, identity, rendering, the writers and the local store. Nothing here
 * reaches `fastify`, so a runtime can depend on this entry and stay free of the
 * cluster service's server dependency — which is the whole reason the package
 * has subpath exports rather than one.
 *
 * The package root (`index.ts`) is the union of this and `service.ts`; import
 * either from there when the split does not matter.
 */

export {createRingBuffer} from './src/buffer.ts';
export type {RingBuffer} from './src/buffer.ts';
export {cachePaths, cacheRecordIds, openCache} from './src/cache.ts';
export type {
    CacheOptions,
    PayloadReader,
    PayloadStore,
    RecordCache,
    RecordStore,
} from './src/cache.ts';
export {callPhaseMessage, CALLS_CAPABILITY, createCallChannel} from './src/capability.ts';
export type {CallChannel, CallEvent, CallPhase, CallWriter} from './src/capability.ts';
export {
    bindInboundLeg,
    bindLeg,
    bindTrace,
    capabilityState,
    currentCapabilities,
    currentContext,
    currentLeg,
    currentTrace,
    enterCapability,
    enterFlow,
    enterInboundLeg,
    enterTrace,
    isLegId,
    isLegSeq,
    isServiceName,
    lastRecordId,
    recordDecision,
    rememberRecord,
    step,
    takeDecision,
    withCapability,
    withFlow,
    withIntent,
} from './src/context.ts';
export type {
    AmbientContext,
    DecisionHolder,
    LegCounter,
    LegIdentity,
    RecordMemory,
} from './src/context.ts';
export {decide} from './src/decide.ts';
export type {Branch} from './src/decide.ts';
export {fingerprint, serializeForIdentity, withIdentity} from './src/fingerprint.ts';
export {enabled, LEVEL_NAMES, levelName, LEVELS, levelValue} from './src/level.ts';
export type {LevelName} from './src/level.ts';
export {DEFAULT_RETENTION_LIMIT, LogBase, resolveHome} from './src/logBase.ts';
export type {
    CallOptions,
    ClusterOptions,
    LogBaseOptions,
    LoggerFace,
    RetentionOptions,
} from './src/logBase.ts';
export {toLogCall} from './src/logCall.ts';
export type {LogCall} from './src/logCall.ts';
export {captureProcessFailures, createLogger} from './src/logger.ts';
export type {Format, Logger, LoggerOptions} from './src/logger.ts';
export {mask} from './src/normalize.ts';
export {
    CAP_FIELD,
    decodeCapabilities,
    encodeCapabilities,
    FLOW_FIELD,
    identityHeaders,
    LEG_FIELD,
    readIdentities,
    SEQ_FIELD,
    TO_FIELD,
    TRACE_FIELD,
    TRACE_HEADER,
    withoutCapabilities,
} from './src/propagation.ts';
export type {Identities} from './src/propagation.ts';
export type {
    Decision,
    ErrorDetail,
    FlowState,
    IntentState,
    LogRecord,
    RefKind,
    Refs,
    RequestDetail,
    ResponseDetail,
} from './src/record.ts';
export {matchesPath, redactRecord} from './src/redact.ts';
export {hyperlink, mintRecordRef, REF_LENGTH, REF_SCHEME, refUri} from './src/refs.ts';
export {renderHuman, renderJson} from './src/render.ts';
export type {RenderOptions} from './src/render.ts';
export {compactStack} from './src/stack.ts';
export {
    createFanoutWriter,
    getWriter,
    setWriter,
    stderrWriter,
    stdoutWriter,
} from './src/writer.ts';
export type {Writer} from './src/writer.ts';
