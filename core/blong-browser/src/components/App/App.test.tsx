import {render as tlRender} from '@testing-library/react';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {useAppStore} from '../../state/appStore.js';
import {App} from './App.js';

beforeEach(() => {
    useAppStore.setState(s => ({
        ...s,
        portal: {tabs: [], activeTabId: null, portalConfig: null},
    }));
});

describe('App', () => {
    it('renders without crashing', () => {
        const dispatch = vi.fn().mockResolvedValue({});
        const {container} = tlRender(<App dispatch={dispatch} />);
        expect(container.querySelector('.blong-portal')).toBeInTheDocument();
    });

    it('passes dispatch to BlongUiProvider', () => {
        const dispatch = vi.fn().mockResolvedValue({ok: true});
        tlRender(
            <App
                dispatch={dispatch}
                schemaUrl="/test.json"
            />,
        );
        // If it renders without throwing, the provider is set up
        expect(dispatch).not.toHaveBeenCalled(); // no immediate dispatch on mount
    });

    it('accepts schemaUrl, baseUrl, debug props', () => {
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
    });

    it('renders custom logo', () => {
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
        expect(getByAltText('App Logo')).toBeInTheDocument();
    });
});
