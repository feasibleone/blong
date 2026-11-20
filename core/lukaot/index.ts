/**
 * lukaot — one declared vocabulary for the signals a process emits.
 *
 * The surface has three parts. The **declaration and its registry** are what a realm, a layer or a
 * library writes: identifiers, their messages, and the policy an operator may override. The
 * **emitters** turn a reached call into a record — a log signal into a line, an error signal into the
 * failure the caller throws — and the **context** carries the identity that travels with them: the
 * trace, the flow execution, the leg a call makes and the capability a flow is served under.
 *
 * What this entry exports is importable in a page as well as in a process, and that is a property to
 * keep rather than a coincidence: shared framework code — a gateway client, a schema helper — is
 * bundled for the browser out of the same tree as the server, so one static `node:` import anywhere in
 * this graph costs a page its whole module chain, not one function (`@@T-732`). The parts that cannot
 * be are here for a node process only, at `@feasibleone/lukaot/node`: the logger that writes lines and
 * the store they are kept in, both of which open a filesystem; and the cluster service at
 * `@feasibleone/lukaot/service`, which reaches `fastify`.
 */

/** The package's own name, which every record names as the emitter it came from. */
export const PACKAGE_NAME = '@feasibleone/lukaot';

export * from './src/capability.ts';
export {
    createCompatLog,
    legacyId,
    type ICompatLog,
    type ICompatLogger,
    type ICompatOptions,
    type ILegacySignal,
    type LevelCalls,
} from './src/compat.ts';
export * from './src/context.ts';
export {decide, type Branch, type DecisionEntry} from './src/decide.ts';
export {
    compose,
    contribute,
    contributedVocabularies,
    declare,
    LEVEL_NAMES,
    normaliseMessage,
    type ICapture,
    type ICaptureEntry,
    type IDecision,
    type IDecisionEntry,
    type DecisionBranch,
    type DecisionId,
    type IErrorEntry,
    type IErrorSignal,
    type ILogEntry,
    type ILogSignal,
    type ISignal,
    type IVocabulary,
    type DeclaredVocabulary,
    type IVocabularyDeclaration,
    type LevelName,
    type MessageOf,
    type PlaceholderNames,
    type SignalId,
    type SignalParams,
    type SignalVocabulary,
} from './src/declare.ts';
export {
    createEmitter,
    render,
    type IEmitterOptions,
    type IIdentity,
    type ISignalRecord,
} from './src/emit.ts';
export {
    compactStack,
    createErrorEmitter,
    isSignalError,
    type IErrorCallOptions,
    type IErrorEmitterOptions,
    type ISignalError,
} from './src/error.ts';
export {enabled, levelName, LEVELS, levelValue} from './src/level.ts';
export {mask} from './src/normalize.ts';
export {
    applyMask,
    HIDDEN,
    httpExchange,
    jsonPayload,
    mergeMask,
    shapes,
    tcpFrame,
    withhold,
    type CaptureFormat,
    type ICaptureShape,
    type IHttpExchange,
    type IJsonPayload,
    type IMask,
    type IMaskByteRule,
    type IMaskDeepRule,
    type IMaskKeep,
    type IMaskPathRule,
    type IRendered,
    type ITcpFrame,
    type MaskMode,
} from './src/capture.ts';
export {
    createCaptureSurface,
    familyOf,
    type CaptureMember,
    type CaptureSurface,
    type ICaptureRecord,
    type ICaptureResolution,
    type ICaptureSelector,
    type ICaptureWriterOptions,
} from './src/captureWriter.ts';
export {getWriter, setWriter, stderrWriter, stdoutWriter, type Writer} from './src/writer.ts';
export * from './src/propagation.ts';
export {
    createSignalProxy,
    type ISignalCallOptions,
    type ISignalProxy,
    type SignalCall,
    type VocabularyProxy,
} from './src/proxy.ts';
export type * from './src/record.ts';
export {matchesPath, redactRecord} from './src/redact.ts';
export {
    signalBindings,
    signalView,
    writeThroughFace,
    type ISignalHost,
    type SignalWriter,
} from './src/view.ts';
export {hyperlink, mintRecordRef, parseReference, REF_LENGTH, REF_SCHEME, refUri, type IParsedReference} from './src/refs.ts';
export {
    createRegistry,
    SignalRegistry,
    type IResolvedPolicy,
    type ISignalCounters,
    type ISignalEntry,
    type ISignalPolicy,
    type PolicyPatch,
} from './src/registry.ts';
export {captureSite, type ISite} from './src/site.ts';
