import {describe, expect, it} from 'vitest';

import {sessionKey} from './sessionKey.js';

describe('sessionKey', () => {
    it('spells the same authority the same way whatever order it arrives in', () => {
        expect(sessionKey('actor-1', {b: true, a: true})).toBe(
            sessionKey('actor-1', {a: true, b: true}),
        );
    });

    it('changes when a grant is added or taken away', () => {
        const before = sessionKey('actor-1', {a: true});
        expect(sessionKey('actor-1', {a: true, b: true})).not.toBe(before);
        expect(sessionKey('actor-1', {a: false})).not.toBe(before);
    });

    it('changes when the reader changes', () => {
        expect(sessionKey('actor-1', {a: true})).not.toBe(sessionKey('actor-2', {a: true}));
    });

    it('reads a bare boolean as the whole map', () => {
        // A permission map is `true`/`false` in a suite with no RBAC realm: everything or nothing.
        expect(sessionKey('actor-1', true)).toBe('actor-1|*');
        expect(sessionKey('actor-1', false)).toBe('actor-1|');
    });

    it('answers an empty identity before a session exists', () => {
        expect(sessionKey(undefined, {})).toBe('|');
    });
});
