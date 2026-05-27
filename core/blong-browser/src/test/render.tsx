import {
    act,
    render as tlRender,
    type RenderOptions,
    type RenderResult,
} from '@testing-library/react';
import React, {type ReactElement} from 'react';
import {vi} from 'vitest';
import {BlongProvider, makeHandlerProxy} from '../context/BlongContext.js';
import {PrimeReactProvider} from '../primereact/index.js';

export interface IRenderOptions extends Omit<RenderOptions, 'wrapper'> {
    dispatch?: (method: string, params?: Record<string, unknown>) => Promise<unknown>;
}

function makeWrapper(dispatch: (method: string, params?: Record<string, unknown>) => Promise<unknown>) {
    // eslint-disable-next-line @eslint-react/component-hook-factories
    return function Wrapper({children}: {children: React.ReactNode}) {
        return (
            <PrimeReactProvider value={{cssTransition: false, ripple: false}}>
                <BlongProvider
                    handlerProxy={makeHandlerProxy(dispatch)}
                >
                    {children}
                </BlongProvider>
            </PrimeReactProvider>
        );
    };
}

export function render(
    ui: ReactElement,
    {dispatch = vi.fn(), ...options}: IRenderOptions = {},
): RenderResult {
    return tlRender(ui, {wrapper: makeWrapper(dispatch), ...options});
}

/**
 * Flush all pending macro-task callbacks (e.g. PrimeReact focus/overlay management
 * scheduled via setTimeout) inside act() so they don't fire during a later
 * findByTestId / waitFor polling window — which would produce "not configured to
 * support act" warnings because @testing-library temporarily sets
 * IS_REACT_ACT_ENVIRONMENT = false while polling.
 *
 * Call this after any `await act(() => Story.play!({...}))` that performs user
 * interactions (clicks, keyboard input) on PrimeReact components.
 */
export const flushEffects = (): Promise<void> =>
    act(async () => {
        await new Promise<void>(resolve => setTimeout(resolve, 0));
    });

// Re-export everything from @testing-library/react so tests have one import
export * from '@testing-library/react';
