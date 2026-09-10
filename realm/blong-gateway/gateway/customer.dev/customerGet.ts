import {validation} from '@feasibleone/blong';

/**
 * Demo metered route: `customer.get` — metered by the 'Customer API' bundle.
 *
 * The `bundle`/`creditCost` fields are threaded into the Fastify route config
 * by Gateway.ts, where the ApiGateway plugin reads them to meter the request.
 */
export default validation(
    async ({lib: {type}}) =>
        function customerGet() {
            return {
                params: type.Object({
                    customerId: type.Optional(type.String()),
                }),
                result: type.Object(
                    {
                        success: type.Boolean(),
                        customer: type.String(),
                    },
                    {additionalProperties: true},
                ),
                bundle: 'Customer API',
                creditCost: 1,
            };
        },
);
