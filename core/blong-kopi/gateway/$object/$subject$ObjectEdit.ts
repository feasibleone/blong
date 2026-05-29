import {validation} from '@feasibleone/blong';

export default validation(
    async ({lib: {type}}) =>
        function $subject$ObjectEdit() {
            return {
                params: type.Object({$objectId: type.String()}, {additionalProperties: true}),
                result: type.Unknown(),
            };
        },
);
