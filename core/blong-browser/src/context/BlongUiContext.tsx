/**
 * BlongUiContext — the central provider that wires together all blong-browser
 * infrastructure: method registry dispatch, schema fetching, QueryClient, etc.
 */
import type {ILogger} from '@feasibleone/blong';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {createContext, use, useMemo, type ReactNode} from 'react';
import {blongEvents} from '../lib/eventBus.js';
import {schemaRegistry as defaultSchemaRegistry} from '../schema/registry.js';
import {useAppStore} from '../state/appStore.js';
import type {IBlongError} from '../types/action.js';
import type {ISchemaRegistry} from '../types/schema.js';

/** Handler dispatch function — calls a method on the browser registry */
export type DispatchFn = <T>(
    method: string,
    params?: Record<string, unknown>,
) => Promise<T> | undefined;

/** Context value shape */
export interface IBlongUiContextValue {
    /** Dispatch to the browser method registry */
    dispatch: DispatchFn;
    /** Schema registry for OpenAPI schema resolution */
    schemaRegistry: ISchemaRegistry;
    /** URL to fetch the OpenAPI schema document from */
    schemaUrl: string;
    /** TanStack Query client (created internally, exposed for advanced use) */
    queryClient: QueryClient;
    /** Application base URL */
    baseUrl?: string;
    /** Debug mode */
    debug: boolean;
    /**
     * Login route — when set, the global error dialog shows a "Login" button
     * that navigates here. Typically used when a dropdown / load error indicates
     * an expired session (401 / unauthenticated).
     */
    loginRoute?: string;
    /** Logger instance */
    log?: ILogger;
}

const BlongUiContext = createContext<IBlongUiContextValue | null>(null);

/** Hook to access the context value — throws if used outside provider */
export function useBlongUi(): IBlongUiContextValue {
    const ctx = use(BlongUiContext);
    if (!ctx) throw new Error('[blong-browser] useBlongUi must be used inside <BlongUiProvider>');
    return ctx;
}

export interface IBlongUiProviderProps {
    /** Method dispatch function (injected by the browser platform) */
    dispatch: DispatchFn;
    /** Logger instance */
    log?: ILogger;
    /** Schema URL override (default: '/openapi.json') */
    schemaUrl?: string;
    /** Custom schema registry (default: singleton) */
    schemaRegistry?: ISchemaRegistry;
    /** Base URL override */
    baseUrl?: string;
    /** Enable debug mode */
    debug?: boolean;
    /**
     * Login route — when set, the global error dialog shows a "Login" button
     * that navigates here. Typically used when a dropdown / load error indicates
     * an expired session (401 / unauthenticated).
     */
    loginRoute?: string;
    children: ReactNode;
}

/** Creates a single QueryClient per provider instance */
function createQueryClient() {
    return new QueryClient({
        defaultOptions: {
            queries: {
                staleTime: 5 * 60 * 1000, // 5 minutes
                retry: 1,
                refetchOnWindowFocus: false,
            },
        },
    });
}

/** Provider component — wrap your application root with this */
export function BlongUiProvider({
    dispatch,
    schemaUrl = '/openapi.json',
    schemaRegistry = defaultSchemaRegistry,
    baseUrl,
    debug = false,
    loginRoute,
    children,
    log,
}: IBlongUiProviderProps) {
    const queryClient = useMemo(() => createQueryClient(), []);

    /**
     * Wrap the incoming dispatch so errors that are NOT field-validation errors
     * (i.e. they have no `validation` array, meaning they are auth/network/server
     * errors) are surfaced via the global error dialog automatically.
     * Field-validation errors are intentionally left for the form to handle.
     * The error is always re-thrown so callers can still react if needed.
     */
    const wrappedDispatch = useMemo<DispatchFn>(
        () =>
            (async (method, params) => {
                blongEvents.emit('action:before', {method, params});
                try {
                    const result = await dispatch(method, params);
                    blongEvents.emit('action:success', {method, params, result});
                    return result;
                } catch (err) {
                    blongEvents.emit('action:error', {method, params, error: err});
                    const blongErr = err as Partial<IBlongError>;
                    if (!blongErr.validation?.length) {
                        useAppStore.getState().showError({
                            type: blongErr.type ?? 'error',
                            message: blongErr.message ?? 'An unexpected error occurred.',
                            print: blongErr.print,
                        } as IBlongError);
                    }
                    throw err;
                }
            }) as DispatchFn,
        [dispatch],
    );

    const value = useMemo<IBlongUiContextValue>(
        () => ({
            dispatch: wrappedDispatch,
            schemaRegistry,
            schemaUrl,
            queryClient,
            baseUrl,
            debug,
            loginRoute,
            log,
        }),
        [wrappedDispatch, schemaRegistry, schemaUrl, queryClient, baseUrl, debug, loginRoute, log],
    );

    return (
        <BlongUiContext value={value}>
            <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
        </BlongUiContext>
    );
}
