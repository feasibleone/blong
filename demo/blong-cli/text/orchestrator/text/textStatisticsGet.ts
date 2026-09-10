import {handler} from '@feasibleone/blong';

import type {TextParams} from './textInput.ts';

/** What `text.statistics.get` reports. */
export type TextStatistics = {
    lines: number;
    words: number;
    characters: number;
};

/** The group's library functions, as the proxy attaches them. */
type TextLib = {textInput: (params: TextParams) => string};

/**
 * `text.statistics.get` — line, word and character counts.
 *
 * Reuses the same `textInput` library as `slug`, which is the point of putting
 * the shared part in a library function rather than in one of the handlers. The
 * member call keeps `this` bound, which is where the library reads `platform`.
 */
export default handler(({lib}) => ({
    textStatisticsGet: (params: TextParams): TextStatistics => {
        const text = String((lib as unknown as TextLib).textInput(params));
        return {
            // A trailing newline is a line terminator, not an extra empty line.
            lines: text ? text.replace(/\r?\n$/, '').split(/\r?\n/).length : 0,
            words: text.split(/\s+/).filter(Boolean).length,
            characters: text.length,
        };
    },
}));
