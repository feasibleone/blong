/// <reference path="./globals.d.ts" />
import type {HRTime} from '@feasibleone/blong';
import load from './load.ts';
import timing from './timing.ts';

declare global {
    interface Performance {
        mozNow?: () => number;
        msNow?: () => number;
        oNow?: () => number;
        webkitNow?: () => number;
    }
}

const performance = globalThis.performance || {};
const performanceNow =
    performance.now ||
    performance.mozNow ||
    performance.msNow ||
    performance.oNow ||
    performance.webkitNow ||
    function () {
        return new Date().getTime();
    };

// generate timestamp or delta
// see http://nodejs.org/api/process.html#process_process_hrtime
function hrtime(previousTimestamp?: HRTime): HRTime {
    const clockTime = performanceNow.call(performance) * 1e-3;
    let seconds = Math.floor(clockTime);
    let nanoseconds = Math.floor((clockTime % 1) * 1e9);
    if (previousTimestamp) {
        seconds = seconds - previousTimestamp[0];
        nanoseconds = nanoseconds - previousTimestamp[1];
        if (nanoseconds < 0) {
            seconds--;
            nanoseconds += 1e9;
        }
    }
    return [seconds, nanoseconds];
}

export default load.bind(null, {
    platform: 'browser',
    loadConfig: async (config: string | object) => ({
        loadedConfig: typeof config === 'string' ? {suite: config} : config,
    }),
    readdir: async () => [],
    existsSync: () => false,
    scan: async () => [],
    createRequire: () => {
        throw new Error('createRequire is not supported in the browser');
    },
    join: (...parts: string[]) => parts.join('/'),
    basename: (path: string, ext?: string) => {
        const base = path.split('/').pop() || '';
        return ext ? base.replace(new RegExp(`${ext}$`), '') : base;
    },
    relative: (from: string, to: string) => {
        const fromParts = from.split('/').filter(Boolean);
        const toParts = to.split('/').filter(Boolean);
        while (fromParts.length && toParts.length && fromParts[0] === toParts[0]) {
            fromParts.shift();
            toParts.shift();
        }
        return [...Array(fromParts.length).fill('..'), ...toParts].join('/') || '.';
    },
    extname: (path: string) => {
        const base = path.split('/').pop() || '';
        const dotIndex = base.lastIndexOf('.');
        return dotIndex !== -1 ? base.slice(dotIndex) : '';
    },
    dirname: (path: string) => path.split('/').slice(0, -1).join('/'),
    resolve: (...paths: string[]) => paths.join('/'),
    readFileSync: () => {
        throw new Error('readFileSync is not supported in the browser');
    },
    writeFileSync: () => {
        throw new Error('writeFileSync is not supported in the browser');
    },
    statSync: (() => undefined) as unknown as import('node:fs').StatSyncFn,
    timing: timing(hrtime),
    configs: ['browser'],
});
