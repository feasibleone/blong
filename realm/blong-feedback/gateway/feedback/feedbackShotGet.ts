import {validation} from '@feasibleone/blong';

/** `feedback.shot.get` — the screenshot data URL of one session (`@@T-472`). */
export default validation(
    async ({lib: {type}}) =>
        function feedbackShotGet() {
            return {
                params: type.Object({sessionId: type.String()}),
                result: type.Object({
                    shotData: type.String(),
                    mimeType: type.String(),
                    shotWidth: type.Optional(type.Number()),
                    shotHeight: type.Optional(type.Number()),
                    byteSize: type.Optional(type.Number()),
                }),
            };
        },
);
