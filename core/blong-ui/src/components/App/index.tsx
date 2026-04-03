/**
 * App — top-level blong-ui application component.
 *
 * Provides the single composition root for the portal UI. Wraps the Portal
 * shell with BlongUiProvider so all child components have access to `dispatch`,
 * the schema registry, and TanStack Query.
 *
 * This component is the canonical reuse point:
 *  - `portalReady` renders it into the DOM via ReactDOM.createRoot
 *  - Storybook decorators mount it with a mock dispatch
 *  - Unit tests can render it with a spy dispatch
 *
 * Props mirror IPortalProps so callers can customise the shell (logo, etc.)
 * while the provider wiring is always handled here.
 */
import React from 'react';
import {BlongUiProvider, type DispatchFn} from '../../context/BlongUiContext.js';
import {Portal, type IPortalProps} from '../Portal/index.js';

export interface IAppProps extends IPortalProps {
    /** Method dispatch — routes calls through the browser handler registry */
    dispatch: DispatchFn;
    /** Schema URL override (default: '/openapi.json') */
    schemaUrl?: string;
    /** Base URL for API calls */
    baseUrl?: string;
    /** Enable debug mode */
    debug?: boolean;
}

export function App({dispatch, schemaUrl, baseUrl, debug, ...portalProps}: IAppProps) {
    return (
        <BlongUiProvider dispatch={dispatch} schemaUrl={schemaUrl} baseUrl={baseUrl} debug={debug}>
            <Portal {...portalProps} />
        </BlongUiProvider>
    );
}
