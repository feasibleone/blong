import {describe, expect, it} from 'vitest';

import {assetReference, assetSrc} from './assetReference.js';

/**
 * The four shapes a field that shows a picture can hold.
 *
 * A stored blob, a URL somebody pasted, a relative path a page ships with, and nothing at all — a
 * resolver that guesses is a picture that loads from the wrong place, so every case is asserted rather
 * than sampled (@@D-842).
 */
describe('assetReference', () => {
    it('turns a stored reference into the route that serves it', () => {
        expect(assetReference('blob://party/7f3a')).toEqual({
            src: '/a/party/7f3a',
            namespace: 'party',
            key: '7f3a',
        });
    });

    it('leaves an absolute and a relative URL alone', () => {
        expect(assetSrc('https://example.com/a.png')).toBe('https://example.com/a.png');
        expect(assetSrc('/img/logo.png')).toBe('/img/logo.png');
        expect(assetSrc('data:image/png;base64,AAAA')).toBe('data:image/png;base64,AAAA');
    });

    it('serves a key whose characters a URL would otherwise misread', () => {
        // The contract admits letters, digits and `._~-` in a key; `~`, `.` and `-` are all legal in a
        // path segment, so the route carries the key as it is — escaping it again would be a different
        // key. What the resolver promises is that nothing it produces needs a second pass.
        expect(assetSrc('blob://party/a~b.c_d-e')).toBe('/a/party/a~b.c_d-e');
        // And a value the contract refuses is refused here too, rather than served under a key nobody
        // wrote: a space is not a character a generated key holds (@@D-842).
        expect(assetSrc('blob://party/a b')).toBeNull();
        expect(assetSrc('blob://party/100%')).toBeNull();
    });

    it('answers nothing for a value that is not one', () => {
        expect(assetReference(undefined)).toBeNull();
        expect(assetReference('')).toBeNull();
        expect(assetReference('   ')).toBeNull();
        expect(assetReference(42)).toBeNull();
        // A reference that does not parse is refused rather than half-served.
        expect(assetReference('blob://party/a/b')).toBeNull();
        expect(assetReference('blob://')).toBeNull();
        expect(assetReference('blob://party/')).toBeNull();
    });

    it('serves from the base a deployment mounted', () => {
        expect(assetSrc('blob://party/k1', {basePath: '/assets/'})).toBe('/assets/party/k1');
        expect(assetSrc('blob://party/k1', {basePath: ''})).toBe('/party/k1');
    });
});
