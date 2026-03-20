import {type IMeta, handler} from '@feasibleone/blong';

type ClockResult = {
    abbreviation: string;
    client_ip: string;
    datetime: string;
    day_of_week: number;
    day_of_year: number;
    dst: boolean;
    dst_offset: number;
    timezone: string;
    unixtime: number;
    utc_datetime: string;
    utc_offset: number;
    week_number: number;
};

function dstOffset(date: Date): number {
    const jan = new Date(date.getFullYear(), 0, 1);
    const jul = new Date(date.getFullYear(), 6, 1);
    const stdTimezoneOffset = Math.max(jan.getTimezoneOffset(), jul.getTimezoneOffset());
    return stdTimezoneOffset - date.getTimezoneOffset();
}

function weekNumber(date: Date): number {
    const d = new Date(+date);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 4 - (d.getDay() || 7));
    return Math.ceil(((d.getTime() - new Date(d.getFullYear(), 0, 1).getTime()) / 8.64e7 + 1) / 7);
}

/**
 * Pure local clock implementation.
 * Returns current time information from the system clock without any external API calls.
 * Useful as a comparison baseline against the world-time API results.
 */
export default handler(
    () =>
        async function clockGet(
            params: {location?: string; area?: string},
            $meta: IMeta,
        ): Promise<ClockResult> {
            const now = new Date();
            const dst_offset = dstOffset(now);
            return {
                abbreviation: Intl.DateTimeFormat().resolvedOptions().timeZone,
                client_ip: $meta.ipAddress || '127.0.0.1',
                datetime: now.toString(),
                day_of_week: now.getDay(),
                day_of_year: now.getDate(),
                dst: dst_offset !== 0,
                dst_offset,
                timezone: now
                    .toLocaleDateString(undefined, {day: '2-digit', timeZoneName: 'long'})
                    .substring(4),
                unixtime: now.getTime(),
                utc_datetime: now.toISOString(),
                utc_offset: now.getTimezoneOffset(),
                week_number: weekNumber(now),
            };
        },
);
