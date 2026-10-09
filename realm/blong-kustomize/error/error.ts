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
};
