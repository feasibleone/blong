import {render as tlRender} from '@testing-library/react';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {makeHandlerProxy} from '../../context/BlongContext.js';
import {useAppStore} from '../../state/appStore.js';
import {flushEffects} from '../../test/render.js';
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
