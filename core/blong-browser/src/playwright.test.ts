/**
 * Tests for the browser-message half of the `Portal` helper.
 *
 * The fixture's promise is that nothing the browser says is lost — and its cost is that
 * everything it says is printed. A spec that provokes a refusal or exercises the renewal
 * path knows which lines are coming and declares them (`blongExpectedBrowserErrors`), so
 * what these tests pin is the distinction the option draws: the message is still
 * collected, and only the echo is dropped.
 */

import type {Page} from '@playwright/test';
import {EventEmitter} from 'node:events';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {Portal} from './playwright.js';

/** A `Page` stub carrying just the events `Portal` listens to. */
function fakePage(): Page & EventEmitter {
    return new EventEmitter() as Page & EventEmitter;
}

/** A console message as Playwright hands it to a `console` listener. */
function consoleMessage(type: string, text: string, url?: string) {
    return {type: () => type, text: () => text, location: () => ({url, lineNumber: 0})};
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe('Portal browser messages', () => {
    it('records and echoes a message nothing declared', () => {
        const saidOutLoud = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const page = fakePage();
        const portal = new Portal(page);

        page.emit('console', consoleMessage('error', 'something broke'));

        expect(portal.browserErrors).toEqual(['error: something broke']);
        expect(saidOutLoud).toHaveBeenCalledWith('[browser] error: something broke');
    });

    it('records an expected message without echoing it', () => {
        const saidOutLoud = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const page = fakePage();
        const portal = new Portal(page, {expected: ['Authorization denied']});

        page.emit('console', consoleMessage('error', 'Authorization denied: not allowed'));

        expect(portal.browserErrors).toEqual(['error: Authorization denied: not allowed']);
        expect(saidOutLoud).not.toHaveBeenCalled();
    });

    it('matches a declared string against the whole recorded line, URL included', () => {
        const saidOutLoud = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const page = fakePage();
        const portal = new Portal(page, {expected: ['unreachable-probe']});

        // The browser's own message for a failed load names no URL in its text; the
        // location is where the URL is, which is why the pattern is matched against the
        // line that gets recorded rather than against the message text alone.
        page.emit(
            'console',
            consoleMessage(
                'error',
                'Failed to load resource',
                'http://127.0.0.1:1/unreachable-probe',
            ),
        );
        page.emit(
            'console',
            consoleMessage('error', 'Failed to load resource', 'http://127.0.0.1:1/other'),
        );

        expect(portal.browserErrors).toHaveLength(2);
        expect(saidOutLoud).toHaveBeenCalledTimes(1);
        expect(saidOutLoud).toHaveBeenCalledWith(
            '[browser] error: Failed to load resource (http://127.0.0.1:1/other:0)',
        );
    });

    it('keeps an expected message in the failure a page reports', () => {
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const page = fakePage();
        const portal = new Portal(page, {expected: ['Authorization denied']});
        page.emit('console', consoleMessage('error', 'Authorization denied: not allowed'));

        const failure = portal.failure(new Error('element never appeared'));

        expect(failure.message).toContain('element never appeared');
        expect(failure.message).toContain('Authorization denied: not allowed');
    });
});
