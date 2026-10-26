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
import {collectStart} from '../../i18n/collect.js';
import {withTranslationReport} from '../../i18n/menu.js';
import {bgLocale} from '../../primereact/locales.js';
import {useAppStore} from '../../state/appStore.js';
import {type IPortalConfig} from '../../storybook.js';
import {AccountMenu} from '../AccountMenu/AccountMenu.js';
import {ErrorDialog} from '../Error/Error.js';
import {ActionHint} from '../Hint/Hint.js';
import {LanguageSwitcher} from '../LanguageSwitcher/LanguageSwitcher.js';
import {Login} from '../Login/Login.js';
import {LoginPopup} from '../LoginPopup/LoginPopup.js';
import {OAuthCallback} from '../OAuthCallback/OAuthCallback.js';
import {Portal, type IPortalProps} from '../Portal/Portal.js';
import {Theme, type IThemeConfig} from '../Theme/Theme.js';
import {ThemeSwitcher} from '../ThemeSwitcher/ThemeSwitcher.js';
import {LanguageDataRefresh} from './LanguageDataRefresh.js';

const DEFAULT_THEME: IThemeConfig = {
    type: 'compact',
    palette: 'dark',
    // Bundled PrimeReact locales — registered up front so `setLanguage`
    // (e.g. from a user's preferred language at login) never crashes the
    // Theme with an unknown locale.  Only activated when that language is set.
    languages: {bg: bgLocale},
};

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
    const {handler, config} = useBlong();
    const isAuthenticated = useAppStore(s => s.auth.isAuthenticated);
    // Boot-time session restore: exchange the restore cookie for fresh tokens
    // so a reload with a live session skips the login screen.  `restored`
    // gates the first paint to avoid a login-screen flash while the request
    // round-trips.
    const [restored, setRestored] = React.useState(false);
    React.useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                await handler.authSessionGet({}, {});
            } catch {
                // Ignore — stays logged out.
            } finally {
                if (!cancelled) setRestored(true);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [handler]);
    // OAuth callback handling runs once — after a successful exchange the
    // callback URL is stripped and the App must drop this screen (the session
    // token is already in the store by then).
    const [oauthHandled, setOauthHandled] = React.useState(false);
    React.useEffect(() => {
        if (isAuthenticated) {
            // The composing entry point, not `portalConfigGet`: that name resolves
            // to a single provider, so two realms that own pages would replace each
            // other's menu (see src/portalConfig.ts).
            const merged = handler.portalConfigMerge({}, {}) as Promise<IPortalConfig> | undefined;
            Promise.resolve(merged)
                .then(config => {
                    // The untranslated-strings page is only reachable from a portal
                    // that collects, so a normal menu never grows it (`D-634`).
                    if (config)
                        useAppStore.getState().setPortalConfig(withTranslationReport(config));
                })
                // The composed answer arrives after the suite's own config has
                // already painted, so the menu (and a realm's brand) changes under
                // the reader's feet. Say when that has happened, one frame later:
                // the Playwright fixture waits for it, so a capture never catches
                // the portal half-composed. Set even when the merge failed, because
                // the failure is what the fixture reports.
                .finally(() => {
                    requestAnimationFrame(() => {
                        document.documentElement.setAttribute('data-portal-config', 'merged');
                    });
                });
        }
    }, [handler, isAuthenticated]);
    // The database half of the dictionary. The method names come from the merged
    // portal configuration, so blong-browser needs no dependency on blong-core and
    // a suite can point them elsewhere (D-630). Registering the loader does not
    // call it: login and the language switcher do. Only the label dictionary is
    // read — a record's own name is translated by the query that reads it, in the
    // active language, and never in the browser (`D-635`).
    const mergedPortalConfig = useAppStore(s => s.portal.portalConfig);
    React.useEffect(() => {
        const load = mergedPortalConfig?.translation?.load;
        const store = useAppStore.getState();
        if (!load?.label) {
            store.setTranslationLoader(undefined);
            return;
        }
        const methods = handler as unknown as Record<
            string,
            ((params: object, $meta: object) => Promise<unknown>) | undefined
        >;
        store.setTranslationLoader(async language => {
            const label = await methods[load.label!]?.({languageCode: language}, {});
            return {label: label as Record<string, string> | undefined};
        });
        // A session that is already up (a restore, or a config that changed under
        // the reader) gets the newly available dictionary without a reload.
        if (store.auth.isAuthenticated) void store.languageActivate(store.language);
    }, [mergedPortalConfig?.translation?.load, handler]);

    const loginHandler = React.useCallback(
        async ({username, password}: {username: string; password: string}) => {
            await handler.authLogin({username, password}, {});
        },
        [handler],
    );

    const appConfig = config as {
        portal?: IBlongPortalConfig;
        login?: {
            registerPage?: string;
            username?: string;
            tokenHint?: {text?: string; command?: string};
        };
        google?: {baseUrl?: string; clientId?: string; redirectUri?: string; scope?: string};
    };
    // Register the app's per-language translation dictionaries so the UI can
    // apply the user's preferred language (returned at login) to the locale.
    // An empty map is registered too: composition then answers with the bundled
    // dictionary, which is all the login screen has before a session exists.
    React.useEffect(() => {
        useAppStore.getState().setTranslationsByLanguage(appConfig.portal?.translations ?? {});
        // Collection is a dev/test facility: the report page and the Playwright
        // seed writer both read it, and a normal portal never turns it on.
        if (appConfig.portal?.translation?.collect) collectStart();
    }, [appConfig.portal?.translations, appConfig.portal?.translation?.collect]);

    // The collector global doubles as the test hook for a language switch: a
    // Playwright fixture cannot reach the store (it is exposed only behind
    // `testHook`), and activating a language has to await the database
    // dictionary rather than only set the locale.
    React.useEffect(() => {
        const api = (globalThis as unknown as {__blongI18n?: Record<string, unknown>}).__blongI18n;
        if (api) {
            api.activate = (language: string) => useAppStore.getState().languageActivate(language);
        }
    }, []);
    const registerPage = appConfig.login?.registerPage;
    const googleEnabled = Boolean(appConfig.google?.baseUrl && appConfig.google?.clientId);
    const onGoogle = React.useCallback(() => {
        void handler.authGoogleRedirect({}, {});
    }, [handler]);
    const onExchange = React.useCallback(
        async ({
            code,
            state,
            redirectUri,
        }: {
            code: string;
            state?: string;
            redirectUri?: string;
        }) => {
            await handler.authGoogleLogin({code, state, redirectUri}, {});
        },
        [handler],
    );

    // OAuth callback route — the Google (or mock) redirect target. The app may
    // be served under a base path (e.g. `/s/`), so match the suffix.
    if (
        typeof window !== 'undefined' &&
        !oauthHandled &&
        window.location.pathname.endsWith('/oauth/callback')
    ) {
        return (
            <OAuthCallback
                onExchange={onExchange}
                onSuccess={() => setOauthHandled(true)}
            />
        );
    }

    // Wait for the boot-time session restore before painting — avoids flashing
    // the login screen when a live session is restored from the cookie.
    if (!restored) return null;

    if (!isAuthenticated) {
        return LoginComponent ? (
            <LoginComponent />
        ) : (
            <Login
                onLogin={loginHandler}
                logoIcon="pi pi-globe"
                title="Blong Portal"
                registerPage={registerPage}
                defaultUsername={appConfig.login?.username}
                passwordHint={appConfig.login?.tokenHint}
                googleLogin={googleEnabled ? {onGoogle} : undefined}
                // titleComponent={}
                // orgComponent={}
            />
        );
    }
    return (
        children ?? (
            <Portal
                {...portalProps}
                menubarEnd={
                    <>
                        <ThemeSwitcher />
                        <LanguageSwitcher />
                        <AccountMenu />
                    </>
                }
            />
        )
    );
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
                    <LanguageDataRefresh />
                    <AppShell
                        loginComponent={loginComponent}
                        portalProps={portalProps}
                    >
                        {children}
                    </AppShell>
                    <LoginPopup />
                    <ErrorDialog />
                    <ConfirmDialog />
                    <ConfirmPopup />
                    <ActionHint />
                </Theme>
            </PrimeReactProvider>
        </BlongProvider>
    );
}
