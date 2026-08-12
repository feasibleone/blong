import {validation} from '@feasibleone/blong';

/**
 * Demo metered route: `vision.compute` — metered by the 'Vision AI' bundle.
 *
 * The `bundle`/`creditCost` fields are threaded into the Fastify route config
 * by Gateway.ts, where the ApiGateway plugin reads them to meter the request.
 */
export default validation(
    async ({lib: {type}}) =>
        function visionCompute() {
            return {
                params: type.Object({
                    imageUrl: type.Optional(type.String()),
                }),
                result: type.Object(
                    {
                        success: type.Boolean(),
                        vision: type.String(),
                    },
                    {additionalProperties: true},
                ),
                bundle: 'Vision AI',
                creditCost: 5,
            };
        },
);
