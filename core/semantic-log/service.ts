/**
 * semantic-log — cluster service surface.
 *
 * The registry, ingestion, detectors, digest, lineage, incidents, flows,
 * diagrams, search, facets, embedding providers and persistence. Every module
 * here is reachable from `fastify` through `./src/service/app.ts`, which is why
 * it is a subpath rather than part of the emitter entry.
 *
 * The package root (`index.ts`) is the union of this and `emitter.ts`; import
 * either from there when the split does not matter.
 */

export {createApp} from './src/service/app.ts';
export type {ServiceOptions} from './src/service/app.ts';
export {DEFAULT_SERVICE_PORT, startService} from './src/service/start.ts';
export type {RunningService, StartServiceOptions} from './src/service/start.ts';
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
export {openCluster} from './src/service/cluster.ts';
export type {ServiceTransportOptions, ServiceWriter} from './src/service/transport.ts';
