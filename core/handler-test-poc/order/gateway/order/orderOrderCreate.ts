import {validation} from '@feasibleone/blong';

export default validation(
    async ({lib: {type}}) =>
        function orderOrderCreate() {
            return {
                params: type.Object({
                    items: type.Array(
                        type.Object({
                            name: type.String(),
                            price: type.Number(),
                            quantity: type.Number(),
                        }),
                    ),
                    customerId: type.String(),
                }),
                result: type.Unknown(),
            };
        },
);
