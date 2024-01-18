import {IMeta, handler} from '@feasibleone/blong';

type ApiHandler = (params: {location?: string; area?: string}) => Promise<object>;

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

export default handler(
    () =>
        async function clockGet(
            params: Parameters<ApiHandler>[0],
            $meta: IMeta
        ): ReturnType<ApiHandler> {
            const now = new Date();
            const dst_offset = dstOffset(now);
            return {
                abbreviation: Intl.DateTimeFormat().resolvedOptions().timeZone,
                client_ip: $meta.ipAddress,
                datetime: now.toString(),
                // eslint-disable-next-line @typescript-eslint/naming-convention
                day_of_week: now.getDay(),
                // eslint-disable-next-line @typescript-eslint/naming-convention
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
        }
);
