import {render as tlRender, type RenderOptions, type RenderResult} from '@testing-library/react';
import React, {type ReactElement} from 'react';
import {vi} from 'vitest';
import {BlongUiProvider, type DispatchFn} from '../context/BlongUiContext.js';

export interface IRenderOptions extends Omit<RenderOptions, 'wrapper'> {
    dispatch?: DispatchFn;
}

function makeWrapper(dispatch: DispatchFn) {
    return function Wrapper({children}: {children: React.ReactNode}) {
        return (
            <BlongUiProvider
                dispatch={dispatch}
                schemaUrl="/test-schema.json"
            >
                {children}
            </BlongUiProvider>
        );
    };
}

export function render(
    ui: ReactElement,
    {dispatch = vi.fn(), ...options}: IRenderOptions = {},
): RenderResult {
    return tlRender(ui, {wrapper: makeWrapper(dispatch), ...options});
}

// Re-export everything from @testing-library/react so tests have one import
export * from '@testing-library/react';
