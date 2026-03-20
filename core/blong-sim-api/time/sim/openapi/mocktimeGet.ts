import {handler} from '@feasibleone/blong';

/**
 * Mock implementation of the world-time GET /timezone/{area}/{location} endpoint.
 *
 * This handler is served by the orchestrator.openapi mock server when the
 * sim layer is active (integration mode). It returns locally computed time data
 * instead of calling an external service.
 *
 * The handler name 'mocktimeGet' maps to the operation via x-blong-method: get
 * defined in world-time.operations.yaml for the /timezone/{area}/{location} path.
 */
export default handler(
    proxy =>
        async function mocktimeGet({area, location}: {area: string; location: string}) {
            const date = new Date();
            const dayOfYear = Math.floor(
                (date.getTime() - new Date(date.getFullYear(), 0, 0).getTime()) /
                    1000 /
                    60 /
                    60 /
                    24,
            );
            return {
                abbreviation: 'UTC',
                client_ip: '127.0.0.1',
                datetime: date.toString(),
                day_of_week: date.getDay(),
                day_of_year: dayOfYear,
                dst:
                    date.getTimezoneOffset() !==
                    new Date(date.getFullYear(), 0, 0).getTimezoneOffset(),
                dst_offset: date.getTimezoneOffset(),
                raw_offset: date.getTimezoneOffset(),
                dst_from: '2025-03-30T01:00:00Z',
                dst_until: '2025-10-26T01:00:00Z',
                timezone: `${area}/${location}`,
                unixtime: date.getTime(),
                utc_datetime: date.toISOString(),
                utc_offset: date.getTimezoneOffset(),
                week_number: Math.floor(
                    (date.getTime() - new Date(date.getFullYear(), 0, 0).getTime()) /
                        1000 /
                        60 /
                        60 /
                        24 /
                        7,
                ),
            };
        },
);
