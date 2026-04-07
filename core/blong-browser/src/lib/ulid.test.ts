import {describe, expect, it} from 'vitest';
import {ulid} from './ulid.js';

describe('ulid', () => {
    it('returns a 20 character string', () => {
        expect(ulid()).toHaveLength(20);
    });

    it('returns only uppercase alphanumeric characters', () => {
        const id = ulid();
        expect(/^[0-9A-Z]+$/.test(id)).toBe(true);
    });

    it('generates unique values', () => {
        const ids = new Set(Array.from({length: 100}, () => ulid()));
        expect(ids.size).toBe(100);
    });

    it('has a time-based prefix component', () => {
        const id = ulid();
        // First 10 chars are the time component (base-36 encoded)
        const timePart = id.slice(0, 10);
        expect(/^[0-9A-Z]{10}$/.test(timePart)).toBe(true);
    });
});
