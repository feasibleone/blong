import type {IRegistry} from '@feasibleone/blong';
import load from '@feasibleone/blong-gogo';
import type {Preview} from '@storybook/react-vite';
import 'primeflex/primeflex.css';
import 'primeicons/primeicons.css';
import 'primereact/resources/primereact.min.css';
import 'primereact/resources/themes/vela-blue/theme.css';
import React from 'react';
import {Hint, useAppStore} from './src/index.ts';
import {fetchStorybookSession, type IStorybookLiveSession} from './src/storybookSession.ts';
import {
    applyStorybookGlobals,
    blongStorybookGlobals,
    blongStorybookToolbar,
    changedStorybookGlobals,
    type IBlongStorybookContext,
    type IBlongStorybookOptions,
    type IBlongStorybookToolbarOptions,
} from './src/storybookToolbar.ts';

export * from './src/storybookToolbar.ts';

// Ensure proper height propagation for fullscreen stories
const style = document.createElement('style');
style.textContent = `
    /* Fix Storybook iframe to fill available space */
    html, body {
        margin: 0;
        padding: 0;
        height: 100%;
        overflow: hidden;
        font-family: 'Roboto';
        color: var(--text-color);
        background-color: var(--surface-0);
    }

    /* Make storybook-root fill the viewport for fullscreen layout */
    #storybook-root {
        height: 100%;
        width: 100%;
        display: flex;
        flex-direction: column;
    }

    /* Ensure stories with fullscreen layout fill the container */
    #storybook-root > * {
        flex: 1;
        min-height: 0;
    }
`;
document.head.appendChild(style);

/** The intents a story always loads with; the live modes add one more. */
const STORYBOOK_INTENTS = ['storybook', 'integration', 'dev'];

/** The intent that turns the model mock off and points the adapter at a gateway. */
function liveIntent(backend: IBlongStorybookOptions['backend']): string | undefined {
    if (backend === 'jsonrpc') return 'storybookJsonrpc';
    if (backend === 'mle') return 'storybookMle';
    return undefined;
}

/**
 * Where {@link withBlong} gets its choices: a fixed object, or a function of the
 * story context — the latter is what makes the toolbar work, since the selected
 * backend and role are globals rather than decorator arguments.
 */
export type BlongStorybookOptionsSource =
    | IBlongStorybookOptions
    | ((context?: IBlongStorybookContext) => IBlongStorybookOptions);

/**
 * Wrap a story in the platform loaded from `browser`.
 *
 * `options.backend` selects where the story's data comes from:
 *
 *  - `mock` (the default) — the `storybook` intent activates the backend
 *    adapter's mock, so every model handler answers from `meta/fixture`.
 *  - `jsonrpc` / `mle` — the adapter is not mocked.  The Storybook dev-server
 *    plugin (`src/storybookBackend.ts`) mints a token for `options.role`; in
 *    `mle` the token is seeded into the MLE codec so the page keeps the key pair
 *    it generated, and in `jsonrpc` the plugin intercepts `/rpc`, adds the
 *    bearer token and decrypts the gateway's response.
 */
export function withBlong(
    browser: Parameters<typeof load>[0],
    optionsSource: BlongStorybookOptionsSource = {},
) {
    // eslint-disable-next-line @eslint-react/component-hook-factories
    return function WithBlong(Story: React.ComponentType, context?: IBlongStorybookContext) {
        const options =
            typeof optionsSource === 'function' ? optionsSource(context) : optionsSource;
        const backend = options.backend ?? 'mock';
        const role = options.role ?? 'Admin';
        const intent = liveIntent(backend);
        const [App, setApp] = React.useState<React.ComponentType<{
            children?: React.ReactNode;
        }> | null>(null);
        const [login, setLogin] = React.useState<IStorybookLiveSession | null>(null);
        React.useEffect(() => {
            let stopped = false;
            let result: IRegistry | undefined;

            useAppStore.getState().setToken('storybook-token');

            (async () => {
                // The call is what tells the dev server which role (and which
                // transport) the following `/rpc` calls belong to; in the MLE mode
                // it also brings the credentials the story logs in with.
                const session =
                    backend === 'mock' ? undefined : await fetchStorybookSession(role, backend);
                const platform = await load(
                    browser,
                    'blong-suite',
                    {
                        browser: {
                            load: {
                                // logLevel: 'debug',
                            },
                            realm: {
                                // logLevel: 'debug',
                            },
                        },
                        apiSchema: false,
                        ui: {
                            portal: {
                                shouldRender: false,
                                // Exposes `window.__blongHandler`, which the MLE
                                // mode's login below needs.  Storybook is a dev tool
                                // and its token is a throwaway, so the hook (which the
                                // Playwright suite already switches on) is safe here.
                                portal: {testHook: true},
                            },
                            mock: {},
                        },
                    },
                    intent ? [...STORYBOOK_INTENTS, intent] : STORYBOOK_INTENTS,
                );
                const registry = await platform.start({});
                if (stopped) return;
                result = registry;
                setApp(
                    () =>
                        registry.getPort('ui.portal')!.config.context
                            ?.container as React.ComponentType,
                );
                if (backend === 'mle' && session?.username && session.password) setLogin(session);
            })().catch(err => {
                console.error('Failed to load Blong platform:', err);
            });

            return () => {
                stopped = true;
                result?.stop();
            };
        }, [backend, role, intent]);

        // The MLE mode cannot be pre-authenticated from outside — a token minted
        // by the dev server cannot be read back (the gateway encrypts the login
        // response) — so the page logs in for itself, with the role's credentials.
        // Still no login screen; it runs once the provider has published its hook.
        React.useEffect(() => {
            if (!App || !login?.username || !login.password) return;
            const handler = (
                globalThis as {
                    __blongHandler?: Record<
                        string,
                        ((params: unknown, meta?: unknown) => Promise<unknown>) | undefined
                    >;
                }
            ).__blongHandler;
            const promise = handler?.authLogin?.(
                {username: login.username, password: login.password},
                {},
            );
            // The story is rendered even when the login fails: the page then shows
            // its own authorization error, which is more useful than a blank frame.
            void (promise ?? Promise.resolve())
                .catch(error => console.error('Storybook live-backend login failed:', error))
                .finally(() => setLogin(null));
        }, [App, login]);

        return App ? (
            <App>
                {/*
                 * The story is withheld while the MLE-mode login runs: rendering it
                 * first would fetch without a session, take a 401 and stay empty
                 * even once the session exists.
                 */}
                {login ? <div>Logging in as {login.username}...</div> : <Story />}
                <Hint />
            </App>
        ) : (
            <div>Loading Blong platform...</div>
        );
    };
}

export default withBlong;

/** Options for {@link defineBlongStorybookPreview}. */
export interface IBlongStorybookPreviewOptions extends IBlongStorybookToolbarOptions {
    /** Storybook parameters merged over the defaults (fullscreen, actions). */
    parameters?: Record<string, unknown>;
}

/** The parameters every Blong preview starts from. */
const DEFAULT_PARAMETERS = {
    actions: {argTypesRegex: '^on[A-Z].*'},
    layout: 'fullscreen',
    controls: {matchers: {color: /(background|color)$/i, date: /Date$/}},
};

/**
 * Applies the toolbar's presentation globals to the app store.
 *
 * This is the *outer* decorator of a preview, and React runs effects
 * children-first, so its effect runs after the story's own decorator — which is
 * what lets the toolbar win over a story's `parameters.theme` / `args.lang` when
 * the reviewer asked for something.  Only a *changed* choice is applied
 * ({@link changedStorybookGlobals}), so the toolbar's defaults leave a story
 * that speaks for itself alone.
 */
export function withBlongStorybookGlobalsFor(
    initial: Record<string, unknown>,
): (Story: React.ComponentType, context?: IBlongStorybookContext) => React.ReactElement {
    return function withBlongStorybookGlobals(Story, context) {
        const changed = changedStorybookGlobals(blongStorybookGlobals(context), initial);
        return (
            <BlongStorybookGlobals {...changed}>
                <Story />
            </BlongStorybookGlobals>
        );
    };
}

/** The component behind {@link withBlongStorybookGlobals} — a decorator must return an element. */
function BlongStorybookGlobals({
    theme,
    language,
    direction,
    children,
}: IBlongStorybookOptions & {children?: React.ReactNode}) {
    React.useEffect(() => {
        applyStorybookGlobals(useAppStore.getState(), {theme, language, direction});
    }, [theme, language, direction]);
    return <>{children}</>;
}

/**
 * The one-liner a `.storybook/preview.tsx` exports.
 *
 * Pass a browser platform entry (a realm's `index.browser.ts`, a suite's
 * `browser.ts`) to get the full toolbar — the stories then run on the loaded
 * platform and can be pointed at a live gateway.  Pass `{decorators}` instead
 * for stories that are decorated by hand (`blong-browser`'s own preview): the
 * toolbar then offers the presentation choices only, because those stories have
 * no platform and therefore no backend adapter to switch.
 */
export function defineBlongStorybookPreview(
    source: Parameters<typeof load>[0] | {decorators: unknown[]},
    options: IBlongStorybookPreviewOptions = {},
): Preview {
    const provided = (source as {decorators?: unknown[]})?.decorators;
    const inner = Array.isArray(provided)
        ? provided
        : // The globals mapper is handed to `withBlong` rather than a fixed object:
          // the toolbar's Backend and Role items live in the story context.
          [withBlong(source as Parameters<typeof load>[0], blongStorybookGlobals)];
    const toolbar = blongStorybookToolbar(options);
    return {
        ...toolbar,
        decorators: [withBlongStorybookGlobalsFor(toolbar.initialGlobals), ...inner],
        parameters: {...DEFAULT_PARAMETERS, ...options.parameters},
    } as Preview;
}
