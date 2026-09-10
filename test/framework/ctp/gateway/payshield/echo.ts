import {validation} from '@feasibleone/blong';

export default validation(
    async ({lib: {type}}) =>
        function payshieldEcho() {
            return {
                params: type.Unknown(),
                result: type.Object({
                    data: type.Unknown(),
                }),
            };
        },
);
