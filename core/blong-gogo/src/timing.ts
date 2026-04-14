import type {HRTime} from '@feasibleone/blong/types';

const timing = (now: (previous?: HRTime) => HRTime) => {
    const diff = (time: HRTime, newTime: HRTime) =>
        (newTime[0] - time[0]) * 1000 + (newTime[1] - time[1]) / 1000000;

    return {
        diff,
        after: (milliseconds: number) => {
            const seconds = Math.floor(milliseconds / 1000);
            const result = now();
            result[1] += Math.floor((milliseconds - seconds * 1000) * 1000000);
            result[0] += seconds;
            if (result[1] >= 1000000000) {
                result[0]++;
                result[1] -= 1000000000;
            }
            return result;
        },
        isAfter: (time: HRTime, timeout: HRTime) =>
            Array.isArray(timeout) &&
            (time[0] > timeout[0] || (time[0] === timeout[0] && time[1] > timeout[1])),
        spare: (time: HRTime, latency?: number) => Math.floor(diff(now(), time)) - (latency || 0),
        now,
    };
};

export type ITiming = ReturnType<typeof timing>;
export default timing;
