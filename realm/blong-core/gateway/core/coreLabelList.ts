import {validation} from '@feasibleone/blong';

/**
 * `core.label.list` — the gateway surface for one language's label dictionary.
 *
 * The handler lives in `adapter/db` (it reads `core_label`); a method needs a
 * validation to have an RPC route, which is what makes it reachable from the
 * browser at `/rpc/core/label/list`.
 */
export default validation(
    async ({lib: {type}}) =>
        function coreLabelList() {
            return {
                params: type.Object({
                    languageCode: type.Optional(type.String()),
                }),
                result: type.Object({}, {additionalProperties: true}),
            };
        },
);
