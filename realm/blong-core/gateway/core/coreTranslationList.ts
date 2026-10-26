import {validation} from '@feasibleone/blong';

/**
 * `core.translation.list` — the gateway surface for one language's resource
 * display names. The handler reads `core_translation` in `adapter/db`.
 */
export default validation(
    async ({lib: {type}}) =>
        function coreTranslationList() {
            return {
                params: type.Object({
                    languageCode: type.Optional(type.String()),
                }),
                result: type.Object({}, {additionalProperties: true}),
            };
        },
);
