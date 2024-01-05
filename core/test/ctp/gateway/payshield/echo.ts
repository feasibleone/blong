import {validation} from '@feasibleone/blong';

export default validation(
    ({lib: {type}}) =>
        function payshieldEcho() {
            return {
                params: type.Any(),
                result: type.Object({
                    data: type.Any(),
                }),
            };
        }
);
