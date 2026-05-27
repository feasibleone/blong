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

    it('calls portal.config.get when authenticated', async () => {
        const dispatch = vi.fn().mockResolvedValue({ok: true});
        tlRender(<App handlerProxy={makeHandlerProxy(dispatch)} />);
        await flushEffects();
        // If it renders without throwing, the provider is set up
        expect(dispatch).toHaveBeenCalledWith('portalConfigGet', {}, {});
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
