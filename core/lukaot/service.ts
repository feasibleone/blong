/**
 * lukaot — the cluster service.
 *
 * A subpath of its own because the service reaches neither the emitter's context nor a running
 * process: it is a pure aggregate over records that arrived on the wire — the ledger of observed
 * signals, the flow ledger the two diagrams are drawn from, the digest of what changed, the search
 * over identifiers, the snapshot that survives a restart and the sink that feeds it all. The HTTP
 * routes that expose it are `T-708`; a package that only writes lines must be able to import this
 * file without loading a server.
 *
 * ```ts
 * import {createServiceWriter} from '@feasibleone/lukaot/service';
 * ```
 *
 * What is deliberately absent, and stays absent unless a founding case brings it back: the
 * embedding provider, the centroids, the anomaly detectors, the incident store and the flow-drift
 * history. A declared identifier makes each of them cheaper *and* less useful — see the plan's
 * "what the anomaly detectors did, and what could come back" — and every one of them cost a
 * dependency a package that only reads records should not carry.
 */

export {createApp, type ServiceOptions} from './src/service/app.ts';
export {
    discriminatorsOf,
    modelOfExecution,
    modelOfObservations,
    modelOfUnion,
    pointsOf,
    renderSequence,
    type DiagramBranch,
    type DiagramCall,
    type DiagramModel,
    type DiagramObservation,
    type DiagramProgress,
    type DiagramRegion,
} from './src/service/diagram.ts';
export {
    DigestLog,
    type DigestEntry,
    type DigestKind,
    type DigestOptions,
} from './src/service/digest.ts';
export {ExemplarStore, type ExemplarStoreOptions} from './src/service/exemplars.ts';
export {FACETS, isFacet, project, type Facet} from './src/service/facets.ts';
export {
    FlowLedger,
    type FlowExecution,
    type FlowUnion,
    type LegEnd,
    type LegObservation,
} from './src/service/flowLedger.ts';
export {createIngest, type IngestDependencies, type IngestResult} from './src/service/ingest.ts';
export {
    legOf,
    progressOf,
    SignalLedger,
    type IngestEvent,
    type SignalEntry,
    type UpsertResult,
} from './src/service/ledger.ts';
export {LineageIndex, type LineageNode} from './src/service/lineage.ts';
export {
    loadSnapshot,
    saveSnapshot,
    SnapshotError,
    type Snapshot,
    type SnapshotFault,
} from './src/service/persistence.ts';
export {
    deployDiff,
    recordText,
    searchRecords,
    searchSignals,
    signalText,
    type DeployDiff,
    type RecordResult,
    type SignalResult,
    type TimeRange,
} from './src/service/search.ts';
export {
    DEFAULT_SERVICE_PORT,
    startService,
    type RunningService,
    type StartServiceOptions,
} from './src/service/start.ts';
export {
    createServiceWriter,
    toEvent,
    type IServiceRecord,
    type ServiceTransportOptions,
    type ServiceWriter,
} from './src/service/transport.ts';
