import {handler} from '@feasibleone/blong';

export default handler(
    proxy =>
        async function mocktimeGet({area, location}: {area: string; location: string}) {
            const date = new Date();
            return {
                abbreviation: 'UTC',
                client_ip: '127.0.0.1',
                datetime: date.toString(),
                // eslint-disable-next-line @typescript-eslint/naming-convention
                day_of_week: date.getDay(),
                // eslint-disable-next-line @typescript-eslint/naming-convention
                day_of_year: Math.floor(
                    (date.getTime() - new Date(date.getFullYear(), 0, 0).getTime()) /
                        1000 /
                        60 /
                        60 /
                        24
                ),
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
                        7
                ),
            };
        }
);
