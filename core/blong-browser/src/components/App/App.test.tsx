import {render as tlRender} from '@testing-library/react';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {makeHandlerProxy} from '../../context/BlongContext.js';
import {useAppStore} from '../../state/appStore.js';
import {act, flushEffects} from '../../test/render.js';
import {App} from './App.js';

beforeEach(() => {
    useAppStore.setState(s => ({
        ...s,
        portal: {tabs: [], activeTabId: null, portalConfig: null},
        auth: {...s.auth, isAuthenticated: true},
    }));
});

describe('App', () => {
    it('renders without crashing', async () => {
        const dispatch = vi.fn().mockResolvedValue({});
        const {container} = tlRender(<App handlerProxy={makeHandlerProxy(dispatch)} />);
        await flushEffects();
        expect(container.querySelector('.blong-portal')).toBeInTheDocument();
    });

    it('composes the portal config when authenticated', async () => {
        const dispatch = vi.fn().mockResolvedValue({ok: true});
        tlRender(<App handlerProxy={makeHandlerProxy(dispatch)} />);
        await flushEffects();
        // The composing method, so a suite with two page-owning realms keeps both
        // menus — `portalConfigGet` resolves to one provider only.
        expect(dispatch).toHaveBeenCalledWith('portalConfigMerge', {}, {});
    });

    it('accepts portal config via handlerProxy.config.portal', async () => {
        const dispatch = vi.fn().mockResolvedValue({});
        expect(() =>
            tlRender(
                <App
                    handlerProxy={makeHandlerProxy(dispatch, {
                        portal: {
                            schemaUrl: '/api/schema.json',
                            baseUrl: 'https://api.example.com',
                            debug: true,
                        },
                    })}
                />,
            ),
        ).not.toThrow();
        await flushEffects();
    });

    // A blob is read by the browser from a plain `<img>`, so the route reads a cookie rather than the
    // session's token: the shell mints that cookie once a session exists and again when the reader's
    // authority changes, and never when the suite names no such method (`@@D-836`).
    describe('scope cookie', () => {
        const scopeDispatch = (issue: 'resolve' | 'reject') =>
            vi.fn(async (method: string) => {
                if (method === 'portalConfigMerge') return {blob: {issue: 'blob.scope.issue'}};
                if (method === 'blob.scope.issue' && issue === 'reject') {
                    throw new Error('no store');
                }
                return {};
            });

        const issued = (dispatch: ReturnType<typeof vi.fn>) =>
            dispatch.mock.calls.filter(([method]) => method === 'blob.scope.issue').length;

        it('issues it once for a session', async () => {
            const dispatch = scopeDispatch('resolve');
            const {container} = tlRender(<App handlerProxy={makeHandlerProxy(dispatch)} />);
            await flushEffects();
            expect(issued(dispatch)).toBe(1);
            expect(container.querySelector('.blong-portal')).toBeInTheDocument();
        });

        it('issues it again when the reader is granted something', async () => {
            const dispatch = scopeDispatch('resolve');
            tlRender(<App handlerProxy={makeHandlerProxy(dispatch)} />);
            await flushEffects();
            expect(issued(dispatch)).toBe(1);
            act(() => useAppStore.getState().setPermissions({'party.person.view': true}));
            await flushEffects();
            expect(issued(dispatch)).toBe(2);
        });

        it('issues nothing when the suite names no method', async () => {
            const dispatch = vi.fn().mockResolvedValue({});
            tlRender(<App handlerProxy={makeHandlerProxy(dispatch)} />);
            await flushEffects();
            expect(issued(dispatch)).toBe(0);
        });

        it('leaves the page up when the issue fails', async () => {
            // A cookie that never arrived breaks the pictures; a page that does not paint breaks the
            // session it was going to vouch for.
            const dispatch = scopeDispatch('reject');
            const {container} = tlRender(<App handlerProxy={makeHandlerProxy(dispatch)} />);
            await flushEffects();
            expect(issued(dispatch)).toBe(1);
            expect(container.querySelector('.blong-portal')).toBeInTheDocument();
        });
    });

    it('renders custom logo', async () => {
        const dispatch = vi.fn().mockResolvedValue({});
        const {getByAltText} = tlRender(
            <App
                handlerProxy={makeHandlerProxy(dispatch)}
                logo={
                    <img
                        src="/logo.png"
                        alt="App Logo"
                    />
                }
            />,
        );
        await flushEffects();
        expect(getByAltText('App Logo')).toBeInTheDocument();
    });
});
