/**
 * BlongUiContext — the central provider that wires together all blong-ui
 * infrastructure: method registry dispatch, schema fetching, QueryClient, etc.
 */
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {createContext, useContext, useMemo, type ReactNode} from 'react';
import {schemaRegistry as defaultSchemaRegistry} from '../schema/registry.js';
import type {ISchemaRegistry} from '../types/schema.js';

/** Handler dispatch function — calls a method on the browser registry */
export type DispatchFn = (method: string, params?: Record<string, unknown>) => Promise<unknown>;

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
}

const BlongUiContext = createContext<IBlongUiContextValue | null>(null);

/** Hook to access the context value — throws if used outside provider */
export function useBlongUi(): IBlongUiContextValue {
    const ctx = useContext(BlongUiContext);
    if (!ctx) throw new Error('[blong-ui] useBlongUi must be used inside <BlongUiProvider>');
    return ctx;
}

export interface IBlongUiProviderProps {
    /** Method dispatch function (injected by the browser platform) */
    dispatch: DispatchFn;
    /** Schema URL override (default: '/openapi.json') */
    schemaUrl?: string;
    /** Custom schema registry (default: singleton) */
    schemaRegistry?: ISchemaRegistry;
    /** Base URL override */
    baseUrl?: string;
    /** Enable debug mode */
    debug?: boolean;
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
    children,
}: IBlongUiProviderProps) {
    const queryClient = useMemo(() => createQueryClient(), []);

    const value = useMemo<IBlongUiContextValue>(
        () => ({
            dispatch,
            schemaRegistry,
            schemaUrl,
            queryClient,
            baseUrl,
            debug,
        }),
        [dispatch, schemaRegistry, schemaUrl, queryClient, baseUrl, debug],
    );

    return (
        <BlongUiContext.Provider value={value}>
            <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
        </BlongUiContext.Provider>
    );
}
