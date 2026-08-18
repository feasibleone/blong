/**
 * error/error.ts — `$subject` typed errors.
 *
 * Errors are namespace-prefixed (`subject.predicate`) and parameterized with
 * `{param}` placeholders; handlers throw them via the `errors` runtime
 * destructure, e.g. `{errors: {error$SubjectInvalidStatus}}`.
 */
export default {
    '$subject.notFound': '$Object {id} not found',
    '$subject.invalidStatus': 'Invalid $object status {status}',
};
