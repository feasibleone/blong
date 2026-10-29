import {validation} from '@feasibleone/blong';

/** `feedback.session.get` — one session by key, with its items (`@@T-472`). */
export default validation(
    async ({lib: {type}}) =>
        function feedbackSessionGet() {
            return {
                params: type.Unknown(),
                result: type.Awaited(type.Unknown()),
            };
        },
);
