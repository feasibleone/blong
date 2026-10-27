/**
 * error/error.ts — `kustomize` typed errors.
 *
 * Errors are namespace-prefixed (`subject.predicate`) and parameterized with
 * `{param}` placeholders; handlers throw them via the `errors` runtime
 * destructure, e.g. `{errors: {errorKustomizeInvalidStatus}}`.
 */
export default {
    'kustomize.notFound': 'Deployment {id} not found',
    'kustomize.invalidStatus': 'Invalid deployment status {status}',
    'kustomize.loginFailed': 'The token could not be verified: {reason}',
    'kustomize.sessionUnknown':
        'No MLE handshake is recorded for {actorId}, so a call it signed cannot be verified — ' +
        'the caller has to log in again',
    'kustomize.sessionUnconfigured': 'This process cannot mint a session: {reason}',
    // The release trigger's two refusals. The token is the only credential a caller outside the
    // cluster can present, so a missing or wrong one is an authentication failure, and the status is
    // what the workflow reads rather than a 500.
    'kustomize.release.tokenMissing': {
        message: 'No release token is configured for this operator',
        statusCode: 401,
    },
    'kustomize.release.tokenMismatch': {
        message: 'The release token is not valid',
        statusCode: 401,
    },
    'kustomize.release.malformed': {
        message: 'The release announcement is incomplete: {reason}',
        statusCode: 422,
    },
};
