/**
 * Unit tests for the browser's half of the live-backend support.
 *
 * The URL matters as much as the payload: the query carries the role and the
 * transport, and the dev server turns them into the cookies the `/rpc` proxy
 * reads — that is the whole contract between the two halves.
 */
import {afterEach, describe, expect, it, vi} from 'vitest';

import {fetchStorybookSession} from './storybookSession.js';

const respond = (body: unknown, ok = true, status = 200) =>
    Promise.resolve({ok, status, json: () => Promise.resolve(body)} as Response);

afterEach(() => {
    vi.restoreAllMocks();
});

describe('fetchStorybookSession', () => {
    it('asks the dev server for a session in the given role and mode', async () => {
        const fetchMock = vi.fn(() => respond({role: 'Manager'}));
        vi.stubGlobal('fetch', fetchMock);

        const session = await fetchStorybookSession('Manager', 'jsonrpc');

        // JSON-RPC mode needs no credentials: the dev server holds the session.
        expect(session).toEqual({role: 'Manager'});
        expect(fetchMock).toHaveBeenCalledWith(
            expect.stringContaining('/__blong/storybook?role=Manager&mode=jsonrpc'),
            expect.objectContaining({headers: {accept: 'application/json'}}),
        );
    });

    it('brings the credentials the MLE mode logs in with', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(() => respond({role: 'Admin', username: 'testAdmin', password: 'testPassword'})),
        );

        const session = await fetchStorybookSession('Admin', 'mle');

        expect(session?.username).toBe('testAdmin');
        expect(session?.password).toBe('testPassword');
    });

    it('reports nothing when the request fails or is rejected', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(() => respond({}, false, 404)),
        );
        expect(await fetchStorybookSession('Admin', 'mle')).toBeUndefined();

        vi.stubGlobal(
            'fetch',
            vi.fn(() => Promise.reject(new Error('offline'))),
        );
        expect(await fetchStorybookSession('Admin', 'mle')).toBeUndefined();
    });
});
