import {validation} from '@feasibleone/blong';

/**
 * Dev-only metered fixture route: `meterprobe.credit` — metered by the
 * 'Meter Probe Credit' bundle.
 *
 * The `bundle`/`creditCost` fields are threaded into the Fastify route config
 * by Gateway.ts, where the ApiGateway plugin reads them to meter the request.
 * The bundle is merged in-test with a small monthly credit bucket so the real
 * HTTP test can trigger a plugin-only 429 (credits).
 */
export default validation(
    async ({lib: {type}}) =>
        function meterprobeCredit() {
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
                bundle: 'Meter Probe Credit',
                creditCost: 5,
            };
        },
);
