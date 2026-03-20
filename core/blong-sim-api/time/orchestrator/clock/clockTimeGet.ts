import {type IMeta, handler} from '@feasibleone/blong';

type ApiHandler = (params: {area: string; location: string}) => Promise<{
    abbreviation: string;
    datetime: string;
}>;

/**
 * Calls the world-time API to get current time for a timezone.
 * Routes through the HTTP adapter using codec.openapi to call
 * GET /timezone/{area}/{location} from the world-time OpenAPI spec.
 *
 * In integration mode, this calls the local mock server (sim layer).
 * In dev/production mode, this calls the real worldtimeapi.org service.
 */
export default handler(
    ({handler: {'time.get': timeGet}}) =>
        async function clockTimeGet(
            params: Parameters<ApiHandler>[0],
            $meta: IMeta,
        ): ReturnType<ApiHandler> {
            return timeGet(params, $meta);
        },
);
