import {declare} from '@feasibleone/lukaot';

/**
 * The `agent` realm's typed errors, as one declarative vocabulary (`@@T-717`).
 *
 * Each key is the identifier a handler calls, and the framework derives the factory's own name from it:
 * `agentSessionNotFound` is reachable as `errors.agentSessionNotFound` *and* as
 * `errors.errorAgentSessionNotFound`, which is the spelling the existing handlers use — so declaring the
 * vocabulary here changes no call site.
 *
 * The HTTP code is part of the contract, not an afterthought: a missing session is a 404, a suspended one
 * is a conflict rather than an absence, an engine that could not be reached is a 502, and
 * `agentCommandDisabled` is a 403 because it reports a capability the deployment switched off rather than
 * a fault.
 *
 * The values a message interpolates are written `{name}` here and supplied by the call, so a call that
 * omits one is refused at compile time rather than printed with a hole in it — which is the whole reason
 * these moved out of a `?name?` map: a placeholder the factory could not check was a message nobody had
 * verified.
 */
export default declare({
    error: {
        agentTaskUnavailable: {
            message: 'The ticket pool is not reachable: {reason}',
            statusCode: 503,
        },
        agentTicketNotFound: {
            message: 'Ticket {ticketId} is not in the pool',
            statusCode: 404,
        },
        agentTicketNotClaimed: {
            message: 'Ticket {ticketId} is not claimed by worker {workerId}',
            statusCode: 409,
        },
        agentSessionNotFound: {
            message: 'Session {sessionId} does not exist',
            statusCode: 404,
        },
        agentSessionSuspended: {
            message: 'Session {sessionId} is suspended and has to be resumed',
            statusCode: 409,
        },
        agentCheckpointMissing: {
            message: 'Session {sessionId} has no checkpoint to resume from',
            statusCode: 409,
        },
        agentEngineUnsupported: {
            message: 'Engine kind {engineKind} is not available in this process',
            statusCode: 400,
        },
        agentEngineFailed: {
            message: 'Engine {engineAccount} failed: {reason}',
            statusCode: 502,
        },
        agentQuestionTimeout: {
            message: 'Question {promptId} was not answered within {timeoutMs} ms',
            statusCode: 408,
        },
        agentWorkspaceEscape: {
            message: 'Path {requestedPath} leaves the workspace of ticket {ticketId}',
            statusCode: 400,
        },
        agentWorkspaceMissing: {
            message: 'Workspace {workspacePath} is not on this host',
            statusCode: 409,
        },
        agentCommandDisabled: {
            message: 'Running commands is disabled in this deployment',
            statusCode: 403,
        },
        agentCommandTimeout: {
            message: 'Command timed out after {timeoutMs} ms',
            statusCode: 504,
        },
        agentStepLimitReached: {
            message: 'Session {sessionId} reached its step limit of {maxSteps}',
            statusCode: 429,
        },
    },
});
