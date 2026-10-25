import unchanged from '@feasibleone/blong';
/**
 * error/error.ts — `sport` typed errors.
 *
 * Errors are namespace-prefixed (`subject.predicate`) and parameterized with
 * `{param}` placeholders; handlers throw them via the `errors` runtime
 * destructure, e.g. `{errors: {errorSportInvalidStatus}}`.
 */
export default {
    'sport.notFound': 'Athlete {id} not found',
    'sport.invalidStatus': 'Invalid athlete status {status}',
};
