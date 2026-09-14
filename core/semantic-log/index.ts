/**
 * semantic-log — public surface (R17–R21).
 *
 * Requirements implemented by this package cite their ids in each module's
 * doc comment. The §5.1 capability parity matrix is audited by
 * `test/parity.test.ts`, and R1–R21 are mapped to the test that demonstrates
 * each by `test/flow/coverage.test.ts`, which checks that every demonstration
 * still exists.
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
export {
    bindInboundLeg,
    bindLeg,
    bindTrace,
    currentContext,
    currentLeg,
    currentTrace,
    isLegId,
    isLegSeq,
    isServiceName,
    lastRecordId,
    recordDecision,
    rememberRecord,
    step,
    takeDecision,
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
export {captureProcessFailures, createLogger} from './src/logger.ts';
export type {Format, Logger, LoggerOptions} from './src/logger.ts';
export {mask} from './src/normalize.ts';
export {
    FLOW_FIELD,
    identityHeaders,
    LEG_FIELD,
    readIdentities,
    SEQ_FIELD,
    TO_FIELD,
    TRACE_FIELD,
    TRACE_HEADER,
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
export {createApp} from './src/service/app.ts';
export type {ServiceOptions} from './src/service/app.ts';
export {cosine, distance, DriftTracker, updateCentroid} from './src/service/centroid.ts';
export type {DriftOptions, DriftResult} from './src/service/centroid.ts';
export {DetectorSuite} from './src/service/detectors.ts';
export type {
    Anomaly,
    AnomalyKind,
    DetectorOptions,
    Observation,
    RateOptions,
} from './src/service/detectors.ts';
export {
    modelOfExecution,
    modelOfObservations,
    modelOfUnion,
    renderSequence,
} from './src/service/diagram.ts';
export type {
    DiagramCall,
    DiagramItem,
    DiagramModel,
    DiagramObservation,
    DiagramReceipt,
} from './src/service/diagram.ts';
export {DigestLog} from './src/service/digest.ts';
export type {DigestEntry, DigestKind, DigestOptions} from './src/service/digest.ts';
export {EmbeddingCache} from './src/service/embedding.ts';
export {ExemplarStore} from './src/service/exemplars.ts';
export {FACETS, isFacet, project} from './src/service/facets.ts';
export type {Facet, FacetAnomaly} from './src/service/facets.ts';
export {FlowLedger} from './src/service/flowLedger.ts';
export type {
    FlowExecution,
    FlowSummary,
    FlowUnion,
    LegEnd,
    LegObservation,
    ObservedLeg,
} from './src/service/flowLedger.ts';
export {correlate, IncidentStore} from './src/service/incidents.ts';
export type {Incident} from './src/service/incidents.ts';
export {createIngest, FlowDriftHistory, FlowShapes} from './src/service/ingest.ts';
export type {FlowDrift, IngestDependencies, IngestResult} from './src/service/ingest.ts';
export {LineageIndex} from './src/service/lineage.ts';
export type {LineageNode} from './src/service/lineage.ts';
export {loadSnapshot, saveSnapshot} from './src/service/persistence.ts';
export {createProvider, hashEmbedding} from './src/service/provider.ts';
export type {EmbeddingConfig, EmbeddingProvider} from './src/service/provider.ts';
export {legOf, refFromFingerprint, TemplateRegistry} from './src/service/registry.ts';
export type {IngestEvent, TemplateEntry, UpsertResult} from './src/service/registry.ts';
export {deployDiff, searchTemplates} from './src/service/search.ts';
export type {DeployDiff, SearchResult, TimeRange} from './src/service/search.ts';
export {createServiceWriter} from './src/service/transport.ts';
export type {ServiceTransportOptions, ServiceWriter} from './src/service/transport.ts';
export {compactStack} from './src/stack.ts';
export {
    createFanoutWriter,
    getWriter,
    setWriter,
    stderrWriter,
    stdoutWriter,
} from './src/writer.ts';
export type {Writer} from './src/writer.ts';
