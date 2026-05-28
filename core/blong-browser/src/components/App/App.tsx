/**
 * App — top-level blong-browser application component.
 *
 * Provides the single composition root for the portal UI. Wraps the Portal
 * shell with BlongProvider so all child components have access to the handler
 * proxy, the schema registry, and TanStack Query.
 *
 * This component is the canonical reuse point:
 *  - `portalReady` renders it into the DOM via ReactDOM.createRoot
 *  - Storybook decorators mount it with a mock handler proxy
 *  - Unit tests can render it with a spy handler proxy
 *
 * Props mirror IPortalProps so callers can customise the shell (logo, etc.)
 * while the provider wiring is always handled here.
 */
import {ConfirmDialog, ConfirmPopup, PrimeReactProvider} from '../../primereact/index.js';
import './App.css';

import type {IHandlerProxy, ILogger} from '@feasibleone/blong';
import React from 'react';
import {BlongProvider, useBlong, type IBlongPortalConfig} from '../../context/BlongContext.js';
import {useAppStore} from '../../state/appStore.js';
import {type IPortalConfig} from '../../storybook.js';
import {ErrorDialog} from '../Error/Error.js';
import {ActionHint} from '../Hint/Hint.js';
import {Login} from '../Login/Login.js';
import {Portal, type IPortalProps} from '../Portal/Portal.js';
import {Theme, type IThemeConfig} from '../Theme/Theme.js';

const DEFAULT_THEME: IThemeConfig = {type: 'compact', palette: 'dark'};

export interface IAppProps extends IPortalProps {
    /**
     * Handler proxy injected by the browser platform.
     * config.portal may contain schemaUrl, baseUrl, debug, loginRoute.
     */
    handlerProxy: IHandlerProxy<{portal?: IBlongPortalConfig} & Record<string, unknown>>;
    /** Logger instance */
    log?: ILogger;
    /** PrimeReact theme configuration (defaults to compact / dark palette) */
    theme?: IThemeConfig;
    /**
     * When provided, renders in place of the Portal shell.
     * Useful for Storybook decorators and unit tests that need provider
     * context (BlongProvider + Theme) without the full portal UI.
     */
    children?: React.ReactNode;
    /**
     * Optional component rendered instead of the portal when the user is not
     * authenticated (i.e. `auth.isAuthenticated` is false).
     * The component may call useBlong() to access the handler proxy.
     */
    loginComponent?: React.ComponentType;
}

function AppShell({
    loginComponent: LoginComponent,
    children,
    portalProps,
}: {
    loginComponent?: React.ComponentType;
    children?: React.ReactNode;
    portalProps: IPortalProps;
}) {
    const {handler} = useBlong();
    const isAuthenticated = useAppStore(s => s.auth.isAuthenticated);
    React.useEffect(() => {
        if (isAuthenticated) {
            (handler.portalConfigGet({}, {}) as Promise<IPortalConfig>)?.then(config => {
                useAppStore.getState().setPortalConfig(config);
            });
        }
    }, [handler, isAuthenticated]);
    const loginHandler = React.useCallback(
        async ({username, password}: {username: string; password: string}) => {
            await handler.authLogin({username, password}, {});
        },
        [handler],
    );
    if (!isAuthenticated) {
        return LoginComponent ? (
            <LoginComponent />
        ) : (
            <Login
                onLogin={loginHandler}
                logoIcon="pi pi-globe"
                title="Blong Portal"
                // titleComponent={}
                // orgComponent={}
            />
        );
    }
    return children ?? <Portal {...portalProps} />;
}

export function App({
    handlerProxy,
    theme = DEFAULT_THEME,
    children,
    loginComponent,
    log,
    ...portalProps
}: IAppProps) {
    return (
        <BlongProvider
            handlerProxy={handlerProxy}
            log={log}
        >
            <PrimeReactProvider>
                <Theme theme={theme}>
                    <AppShell
                        loginComponent={loginComponent}
                        portalProps={portalProps}
                    >
                        {children}
                    </AppShell>
                    <ErrorDialog />
                    <ConfirmDialog />
                    <ConfirmPopup />
                    <ActionHint />
                </Theme>
            </PrimeReactProvider>
        </BlongProvider>
    );
}
