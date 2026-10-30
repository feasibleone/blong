import {describe, expect, it} from 'vitest';
import {isExpectedError} from './expected.js';

/**
 * The rules the browser applies to `$meta.expect` — the same three the server's
 * `isExpectedError` (`blong-gogo/src/lib.ts`) applies, because a declaration has
 * to mean the same thing on both sides of the wire.
 */
describe('isExpectedError', () => {
    it('matches one declared type exactly', () => {
        expect(isExpectedError('gateway.notAllowed', 'gateway.notAllowed')).toBe(true);
        expect(isExpectedError('gateway.notAllowed', 'gateway.jwtMissingHeader')).toBe(false);
    });

    it('matches any type of a declared list', () => {
        const declared = ['gateway.notAllowed', 'login.invalidCookie'];
        expect(isExpectedError('login.invalidCookie', declared)).toBe(true);
        expect(isExpectedError('gateway.noActions', declared)).toBe(false);
    });

    it('matches a trailing wildcard as a prefix', () => {
        expect(isExpectedError('gateway.notAllowed', 'gateway.*')).toBe(true);
        expect(isExpectedError('login.invalidCookie', 'gateway.*')).toBe(false);
    });

    it('treats no declaration as no expectation', () => {
        expect(isExpectedError('gateway.notAllowed', undefined)).toBe(false);
        expect(isExpectedError(undefined, 'gateway.notAllowed')).toBe(false);
        expect(isExpectedError(undefined, undefined)).toBe(false);
    });
});
