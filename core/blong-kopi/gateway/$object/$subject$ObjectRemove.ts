import {validation} from '@feasibleone/blong';

export default validation(
    ({lib: {type}}) =>
        function $subject$ObjectRemove() {
            return {
                params: type.Object({$objectId: type.String()}),
                result: type.Any(),
            };
        }
);
