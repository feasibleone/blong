import unchanged from '@feasibleone/blong';
/**
 * error/error.ts — `viewer` typed errors.
 *
 * Errors are namespace-prefixed (`subject.predicate`) and parameterized with
 * `{param}` placeholders; handlers throw them via the `errors` runtime
 * destructure, e.g. `{errors: {errorViewerInvalidStatus}}`.
 */
export default {
    'viewer.notFound': 'Entry {id} not found',
    'viewer.invalidStatus': 'Invalid entry status {status}',
};
