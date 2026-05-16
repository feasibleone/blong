import {validation} from '@feasibleone/blong';

export default validation(
    ({lib: {type}}) =>
        function parkingTest() {
            return {
                params: type.Unknown(),
                result: type.Object({
                    zone: type.String(),
                    price: type.Number(),
                }),
            };
        }
);
