import {validation} from '@feasibleone/blong';

export default validation(
    async ({lib: {type}}) =>
        function parkingTest() {
            return {
                params: type.Unknown(),
                result: type.Object({
                    zone: type.String(),
                    price: type.Number(),
                }),
            };
        },
);
