import type {Expect, Page} from '@playwright/test';
import {describe, expect, it} from 'vitest';

import {captureWith} from './model.js';

/**
 * What a `redact` list does to a capture, and that naming nothing does nothing.
 *
 * The redaction itself is `redact.ts`'s (tested there) and the picture is Playwright's.
 * What this pins is the pair in order — redact, then screenshot — because that order is
 * what makes a spec's `redact` option reach every capture the model helpers take, and a
 * spec that names no pattern pays no page walk for it.
 */
const fakePage = (redacted: string[]) =>
    ({$$eval: async (selector: string) => void redacted.push(selector)}) as unknown as Page;

const fakeExpect = (shots: string[]) =>
    (() => ({
        toHaveScreenshot: async (name: string) => void shots.push(name),
    })) as unknown as Expect;

describe('captureWith', () => {
    it('redacts the page before it screenshots it', async () => {
        const redacted: string[] = [];
        const shots: string[] = [];
        await captureWith(fakeExpect(shots), ['5d78c9869d'])(fakePage(redacted), 'pods.png');
        expect(redacted).toHaveLength(1);
        expect(shots).toEqual(['pods.png']);
    });

    it('screenshots without touching the page when it was given no patterns', async () => {
        const redacted: string[] = [];
        const shots: string[] = [];
        await captureWith(fakeExpect(shots))(fakePage(redacted), 'browse.png');
        expect(redacted).toEqual([]);
        expect(shots).toEqual(['browse.png']);
    });

    it('treats an empty list as nothing to do', async () => {
        const redacted: string[] = [];
        const shots: string[] = [];
        await captureWith(fakeExpect(shots), [])(fakePage(redacted), 'browse.png');
        expect(redacted).toEqual([]);
        expect(shots).toEqual(['browse.png']);
    });
});
