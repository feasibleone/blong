import {render as tlRender} from '@testing-library/react';
import {beforeEach, describe, expect, it, vi} from 'vitest';
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
        const {container} = tlRender(<App dispatch={dispatch} />);
        await flushEffects();
        expect(container.querySelector('.blong-portal')).toBeInTheDocument();
    });

    it('passes dispatch to BlongUiProvider', async () => {
        const dispatch = vi.fn().mockResolvedValue({ok: true});
        tlRender(
            <App
                dispatch={dispatch}
                schemaUrl="/test.json"
            />,
        );
        await flushEffects();
        // If it renders without throwing, the provider is set up
        expect(dispatch).toHaveBeenCalledWith('portal.config.get', {}); // calls portal.config.get when authenticated
    });

    it('accepts schemaUrl, baseUrl, debug props', async () => {
        const dispatch = vi.fn().mockResolvedValue({});
        expect(() =>
            tlRender(
                <App
                    dispatch={dispatch}
                    schemaUrl="/api/schema.json"
                    baseUrl="https://api.example.com"
                    debug
                />,
            ),
        ).not.toThrow();
        await flushEffects();
    });

    it('renders custom logo', async () => {
        const dispatch = vi.fn().mockResolvedValue({});
        const {getByAltText} = tlRender(
            <App
                dispatch={dispatch}
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
