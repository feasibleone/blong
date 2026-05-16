import {validation} from '@feasibleone/blong';

export default validation(
    ({lib: {type}}) =>
        function payshieldEcho() {
            return {
                params: type.Unknown(),
                result: type.Object({
                    data: type.Unknown(),
                }),
            };
        },
);
