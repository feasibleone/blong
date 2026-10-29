import {validation} from '@feasibleone/blong';

/**
 * `feedback.session.find` — the review list (`@@T-472`).
 *
 * Paging, ordering and filtering are the generic CRUD's; the result is the page
 * of session rows without their pictures, which is what makes the list cheap.
 */
export default validation(
    async ({lib: {type}}) =>
        function feedbackSessionFind() {
            return {
                params: type.Unknown(),
                result: type.Awaited(type.Unknown()),
            };
        },
);
