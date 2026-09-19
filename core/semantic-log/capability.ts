/**
 * semantic-log — capability surface.
 *
 * The per-execution switches and the level-free channels they switch: enough to
 * ask "may this execution record calls?", to carry the answer with the identity,
 * and to write the call records when it says yes. Nothing here reaches `fastify`,
 * and nothing here knows a runtime's record envelope — see `src/capability.ts`.
 */

export {callPhaseMessage, CALLS_CAPABILITY, createCallChannel} from './src/capability.ts';
export type {CallChannel, CallEvent, CallPhase, CallWriter} from './src/capability.ts';
export {
    capabilityState,
    currentCapabilities,
    enterCapability,
    withCapability,
} from './src/context.ts';
export {
    CAP_FIELD,
    decodeCapabilities,
    encodeCapabilities,
    TRACE_HEADER,
    withoutCapabilities,
} from './src/propagation.ts';
