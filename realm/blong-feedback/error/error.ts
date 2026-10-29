/**
 * error/error.ts — `feedback` typed errors (`@@T-457`).
 *
 * Errors are namespace-prefixed (`subject.predicate`) and parameterized with
 * `{param}` placeholders; handlers throw them via the `errors` runtime
 * destructure, e.g. `{errors: {feedbackSessionNotFound}}`.
 *
 * `feedback.invalidTarget` is the one a client can trigger on its own: the
 * identifier it sent does not match the grammar of plan section 3, which means a
 * target was annotated wrongly rather than that the request was malformed.
 */
export default {
    'feedback.sessionNotFound': 'Feedback session {sessionId} not found',
    'feedback.itemNotInSession': 'Feedback item {itemId} does not belong to session {sessionId}',
    'feedback.shotMissing': 'Feedback session {sessionId} has no screenshot',
    'feedback.shotTooLarge': 'The screenshot is {byteSize} bytes; the limit is {limit}',
    'feedback.invalidTarget': 'Not a feedback identifier: {targetId}',
    'feedback.emptySubmission': 'A submission needs at least one item',
};
