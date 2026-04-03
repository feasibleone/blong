import React from 'react';
import {describe, expect, it} from 'vitest';
import {render, screen, waitFor} from '../../test/render.js';
import {Async} from './index.js';

describe('Async', () => {
    it('shows fallback while loading', async () => {
        let resolve!: (v: React.ComponentType) => void;
        const component = () =>
            new Promise<React.ComponentType>(r => {
                resolve = r;
            });
        render(
            <Async
                component={component}
                fallback={<div data-testid="loading">Loading...</div>}
            />,
        );
        expect(screen.getByTestId('loading')).toBeInTheDocument();
        // Cleanup: resolve to avoid dangling promise
        resolve(() => null);
    });

    it('renders the loaded component', async () => {
        const FakeComp = () => <div data-testid="loaded">Loaded!</div>;
        render(<Async component={() => Promise.resolve(FakeComp as React.ComponentType)} />);
        await waitFor(() => expect(screen.getByTestId('loaded')).toBeInTheDocument());
    });

    it('passes params to the loaded component', async () => {
        const FakeComp = (props: {message?: string}) => (
            <div data-testid="with-params">{props.message}</div>
        );
        render(
            <Async
                component={() => Promise.resolve(FakeComp as unknown as React.ComponentType)}
                params={{message: 'Hello World'}}
            />,
        );
        await waitFor(() =>
            expect(screen.getByTestId('with-params')).toHaveTextContent('Hello World'),
        );
    });

    it('shows default loading indicator when fallback is not provided', async () => {
        let resolve!: (v: React.ComponentType) => void;
        const component = () =>
            new Promise<React.ComponentType>(r => {
                resolve = r;
            });
        const {container} = render(<Async component={component} />);
        // The fallback is a ProgressBar — check for the blong-async-loading container
        expect(container.querySelector('.blong-async-loading')).toBeInTheDocument();
        resolve(() => null);
    });
});
