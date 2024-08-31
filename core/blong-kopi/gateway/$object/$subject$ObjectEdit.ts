import {validation} from '@feasibleone/blong';

export default validation(
    ({lib: {type}}) =>
        function $subject$ObjectEdit() {
            return {
                params: type.Object({$objectId: type.String()}, {additionalProperties: true}),
                result: type.Any(),
            };
        }
);
