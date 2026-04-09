/**
 * App — top-level blong-browser application component.
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
import './index.css';
import {ConfirmDialog, ConfirmPopup} from '../../primereact/index.js';


import React from 'react';
import {BlongUiProvider, type DispatchFn} from '../../context/BlongUiContext.js';
import {ErrorDialog} from '../Error/index.js';
import {ActionHint} from '../Hint/index.js';
import {Portal, type IPortalProps} from '../Portal/index.js';
import {Theme, type IThemeConfig} from '../Theme/index.js';
import {useAppStore} from '../../state/appStore.js';

const DEFAULT_THEME: IThemeConfig = {name: 'lara-light-blue', palette: 'light'};

export interface IAppProps extends IPortalProps {
    /** Method dispatch — routes calls through the browser handler registry */
    dispatch: DispatchFn;
    /** Schema URL override (default: '/openapi.json') */
    schemaUrl?: string;
    /** Base URL for API calls */
    baseUrl?: string;
    /** Enable debug mode */
    debug?: boolean;
    /** PrimeReact theme configuration (defaults to lara-light-blue / light palette) */
    theme?: IThemeConfig;
    /**
     * Login route — when set, the global error dialog shows a "Login" button
     * that navigates here when a session-expiry error occurs.
     */
    loginRoute?: string;
    /**
     * When provided, renders in place of the Portal shell.
     * Useful for Storybook decorators and unit tests that need provider
     * context (BlongUiProvider + Theme) without the full portal UI.
     */
    children?: React.ReactNode;
    /**
     * Optional component rendered instead of the portal when the user is not
     * authenticated (i.e. `auth.isAuthenticated` is false).
     * Receives `dispatch` as a prop so it can call login handlers.
     */
    loginComponent?: React.ComponentType<{dispatch: DispatchFn}>;
}

function AppShell({
    loginComponent: LoginComponent,
    dispatch,
    children,
    portalProps,
}: {
    loginComponent?: React.ComponentType<{dispatch: DispatchFn}>;
    dispatch: DispatchFn;
    children?: React.ReactNode;
    portalProps: IPortalProps;
}) {
    const isAuthenticated = useAppStore(s => s.auth.isAuthenticated);
    if (LoginComponent && !isAuthenticated) {
        return <LoginComponent dispatch={dispatch} />;
    }
    return <>{children ?? <Portal {...portalProps} />}</>;
}

export function App({
    dispatch,
    schemaUrl,
    baseUrl,
    debug,
    loginRoute,
    theme = DEFAULT_THEME,
    children,
    loginComponent,
    ...portalProps
}: IAppProps) {
    return (
        <BlongUiProvider
            dispatch={dispatch}
            schemaUrl={schemaUrl}
            baseUrl={baseUrl}
            debug={debug}
            loginRoute={loginRoute}
        >
            <Theme theme={theme}>
                <AppShell
                    loginComponent={loginComponent}
                    dispatch={dispatch}
                    portalProps={portalProps}
                >
                    {children}
                </AppShell>
                <ErrorDialog />
                <ConfirmDialog />
                <ConfirmPopup />
                <ActionHint />
            </Theme>
        </BlongUiProvider>
    );
}
