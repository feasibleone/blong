/**
 * error/error.ts — the `agent` realm's typed errors.
 *
 * Errors are namespace-prefixed and parameterized with `?param?` placeholders; a handler throws
 * them through the `errors` runtime destructure, e.g. `errors.errorAgentSessionNotFound`. The HTTP
 * code is the answer a gateway caller receives, so it is part of the contract: a missing session is
 * a 404, a suspended one is a conflict rather than an absence, and an engine that could not be
 * reached is a 502.
 *
 * `agent.commandDisabled` reports a capability the deployment switched off, not a fault; that is why
 * it is a 403 and not a 500.
 */
export default {
    'agent.taskUnavailable': {
        message: 'The ticket pool is not reachable: ?reason?',
        statusCode: 503,
    },
    'agent.ticketNotFound': {
        message: 'Ticket ?ticketId? is not in the pool',
        statusCode: 404,
    },
    'agent.ticketNotClaimed': {
        message: 'Ticket ?ticketId? is not claimed by worker ?workerId?',
        statusCode: 409,
    },
    'agent.sessionNotFound': {
        message: 'Session ?sessionId? does not exist',
        statusCode: 404,
    },
    'agent.sessionSuspended': {
        message: 'Session ?sessionId? is suspended and has to be resumed',
        statusCode: 409,
    },
    'agent.checkpointMissing': {
        message: 'Session ?sessionId? has no checkpoint to resume from',
        statusCode: 409,
    },
    'agent.engineUnsupported': {
        message: 'Engine kind ?engineKind? is not available in this process',
        statusCode: 400,
    },
    'agent.engineFailed': {
        message: 'Engine ?engineAccount? failed: ?reason?',
        statusCode: 502,
    },
    'agent.questionTimeout': {
        message: 'Question ?promptId? was not answered within ?timeoutMs? ms',
        statusCode: 408,
    },
    'agent.workspaceEscape': {
        message: 'Path ?requestedPath? leaves the workspace of ticket ?ticketId?',
        statusCode: 400,
    },
    'agent.workspaceMissing': {
        message: 'Workspace ?workspacePath? is not on this host',
        statusCode: 409,
    },
    'agent.commandDisabled': {
        message: 'Running commands is disabled in this deployment',
        statusCode: 403,
    },
    'agent.commandTimeout': {
        message: 'Command timed out after ?timeoutMs? ms',
        statusCode: 504,
    },
    'agent.stepLimitReached': {
        message: 'Session ?sessionId? reached its step limit of ?maxSteps?',
        statusCode: 429,
    },
};
