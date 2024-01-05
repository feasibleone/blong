import {validation} from '@feasibleone/blong';

export default validation(
    ({lib: {type}}) =>
        function parkingTest() {
            return {
                params: type.Any(),
                result: type.Object({
                    zone: type.String(),
                    price: type.Number(),
                }),
            };
        }
);
