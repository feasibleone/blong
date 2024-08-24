import {validation} from '@feasibleone/blong';

export default validation(
    ({lib: {type}}) =>
        function $subject$ObjectAdd() {
            return {
                params: type.Object({name: type.String()}),
                result: type.Any(),
            };
        }
);
