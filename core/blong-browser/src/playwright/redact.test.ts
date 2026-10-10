import {describe, expect, it} from 'vitest';

import {redactText} from './redact.js';

/**
 * What a match becomes, and what it must *not* match.
 *
 * The page half of this module needs a browser; the rule it applies is this function's,
 * so these assertions are the contract the two halves share — which pattern shapes mean
 * what, how many occurrences one match covers, and that a caller who names a substring
 * gets that substring rather than a regex they did not write.
 */

describe('redactText', () => {
    it('matches a string literally, not as a pattern', () => {
        expect(redactText('a.b.c', ['.'])).toBe('a###b###c');
        expect(redactText('coredns-5d78c9869d-4tm59', ['5d78c9869d'])).toBe('coredns-###-4tm59');
    });

    it('replaces every occurrence, not only the first', () => {
        expect(redactText('id-1 id-2 id-3', ['id-'])).toBe('###1 ###2 ###3');
        expect(redactText('id-1 id-2 id-3', [/id-/])).toBe('###1 ###2 ###3');
        expect(redactText('uid a1b2c3d4-e5f6 uid', [/[0-9a-f]{8}-[0-9a-f]{4}/])).toBe(
            'uid ### uid',
        );
    });

    it('hides only what a pattern matches', () => {
        expect(redactText('417', [/^\d+$/])).toBe('###');
        expect(redactText('1.2.3', [/^\d+\.\d+\.\d+$/])).toBe('###');
        expect(redactText('1.2.3', [/^\d+$/])).toBe('1.2.3');
    });

    it('leaves text that nothing matches untouched', () => {
        expect(redactText('kube-system', [/^\d+$/])).toBe('kube-system');
        expect(redactText('', ['.'])).toBe('');
        expect(redactText('anything', [])).toBe('anything');
    });

    it('takes the placeholder from the caller', () => {
        expect(redactText('a1b2', [/\d/g], '…')).toBe('a…b…');
        expect(redactText('a1b2', [/\d+/g], '')).toBe('ab');
    });

    it('applies the patterns in the order they were given', () => {
        // The second rule sees what the first left — the rest of the hash, because the
        // placeholder it wrote holds no digits to match again.
        expect(redactText('hash 5d78c9869d', [/c9869d/, /5d78/])).toBe('hash ######');
    });
});
