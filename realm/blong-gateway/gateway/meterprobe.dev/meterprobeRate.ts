import {validation} from '@feasibleone/blong';

/**
 * Dev-only metered fixture route: `meterprobe.rate` — metered by the
 * 'Meter Probe Rate' bundle.
 *
 * The `bundle`/`creditCost` fields are threaded into the Fastify route config
 * by Gateway.ts, where the ApiGateway plugin reads them to meter the request.
 * The bundle is merged in-test with a low rate limit so the real HTTP test can
 * trigger a plugin-only 429 (rate).
 */
export default validation(
    async ({lib: {type}}) =>
        function meterprobeRate() {
            return {
                params: type.Object({
                    probe: type.Optional(type.String()),
                }),
                result: type.Object(
                    {
                        success: type.Boolean(),
                        probe: type.String(),
                    },
                    {additionalProperties: true},
                ),
                bundle: 'Meter Probe Rate',
                creditCost: 1,
            };
        },
);
