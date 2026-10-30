/**
 * error/error.ts — the `chat` realm's typed errors.
 *
 * Errors are namespace-prefixed (`subject.predicate`) and parameterized with `{param}` placeholders;
 * a handler throws them through the `errors` runtime destructure. The HTTP codes are the receiver's
 * and the gateway's answer, so they are part of the contract rather than a formatting choice: a bad
 * platform signature is a 401 before any handler runs, and an ask that nobody answered is a 408
 * (`@@D-678`).
 *
 * `chat.platformUnsupported` is the one that reports a capability rather than a fault: Viber has no
 * checkbox and no form, so a multi-choice prompt there is refused instead of silently degraded into
 * something that looks like a different question.
 */
export default {
    'chat.accountNotFound': {
        message: 'Chat account {accountName} is not configured for platform {platformName}',
        statusCode: 404,
    },
    'chat.platformUnsupported': {
        message: 'Platform {platformName} cannot render the {controlKind} control',
        statusCode: 400,
    },
    'chat.signatureInvalid': {
        message: 'The {platformName} signature does not match the request body',
        statusCode: 401,
    },
    'chat.payloadInvalid': {
        message: 'The {platformName} payload is not one this port understands',
        statusCode: 400,
    },
    'chat.promptTimeout': {
        message: 'Prompt {promptId} was not answered within {timeoutMs} ms',
        statusCode: 408,
    },
    'chat.promptNothingPending': {
        message: 'Prompt {promptId} is not waiting for an answer',
        statusCode: 409,
    },
    'chat.sendFailed': {
        message: 'Sending to {platformName} failed: {reason}',
        statusCode: 502,
    },
};
