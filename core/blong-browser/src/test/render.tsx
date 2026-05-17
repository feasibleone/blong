import {act, render as tlRender, type RenderOptions, type RenderResult} from '@testing-library/react';
import React, {type ReactElement} from 'react';
import {vi} from 'vitest';
import {BlongUiProvider, type DispatchFn} from '../context/BlongUiContext.js';
import {PrimeReactProvider} from '../primereact/index.js';

export interface IRenderOptions extends Omit<RenderOptions, 'wrapper'> {
    dispatch?: DispatchFn;
}

function makeWrapper(dispatch: DispatchFn) {
    return function Wrapper({children}: {children: React.ReactNode}) {
        return (
            <PrimeReactProvider value={{cssTransition: false, ripple: false}}>
                <BlongUiProvider
                    dispatch={dispatch}
                    schemaUrl="/test-schema.json"
                >
                    {children}
                </BlongUiProvider>
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
 * Flush all pending macrotask callbacks (e.g. PrimeReact focus/overlay management
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
