/**
 * BlongContext — the central provider that wires together all blong-browser
 * infrastructure: handler proxy, schema registry, QueryClient, etc.
 */
import type {IHandlerProxy, ILogger, IMeta} from '@feasibleone/blong';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {createContext, use, useMemo, type ReactNode} from 'react';
import {blongEvents} from '../lib/eventBus.js';
import {schemaRegistry as defaultSchemaRegistry} from '../schema/registry.js';
import {useAppStore} from '../state/appStore.js';
import type {IBlongError} from '../types/action.js';
import type {ISchemaRegistry} from '../types/schema.js';

/** Portal-specific UI configuration accessed from IHandlerProxy.config.portal */
export interface IBlongPortalConfig {
    /** URL to fetch the OpenAPI schema document from (default: '/openapi.json') */
    schemaUrl?: string;
    /** Application base URL */
    baseUrl?: string;
    /** Enable debug mode */
    debug?: boolean;
    /**
     * Login route — when set, the global error dialog shows a "Login" button
     * that navigates here. Typically used when a dropdown / load error indicates
     * an expired session (401 / unauthenticated).
     */
    loginRoute?: string;
}

type AnyHandlerProxy = IHandlerProxy<Record<string, unknown>>;

/** Context value shape */
export interface IBlongContextValue {
    /** Handler proxy — call methods via handler.subjectObjectPredicate(params, $meta) */
    handler: AnyHandlerProxy['handler'];
    /** Runtime configuration — portal UI settings in config.portal */
    config: Record<string, unknown> & {portal?: IBlongPortalConfig};
    /** Library functions from the handler group */
    lib: AnyHandlerProxy['lib'];
    /** Typed errors from the realm's error layer */
    errors: AnyHandlerProxy['errors'];
    /** Schema registry for OpenAPI schema resolution */
    schemaRegistry: ISchemaRegistry;
    /** TanStack Query client (created internally, exposed for advanced use) */
    queryClient: QueryClient;
    /** Logger instance */
    log?: ILogger;
}

const BlongContext = createContext<IBlongContextValue | null>(null);

/** Hook to access the blong context value — throws if used outside provider */
export function useBlong(): IBlongContextValue {
    const ctx = use(BlongContext);
    if (!ctx) throw new Error('[blong-browser] useBlong must be used inside <BlongProvider>');
    return ctx;
}

export interface IBlongProviderProps {
    /**
     * Handler proxy injected by the browser platform (from ready.ts).
     * config.portal may contain schemaUrl, baseUrl, debug, loginRoute.
     */
    handlerProxy: IHandlerProxy<{portal?: IBlongPortalConfig} & Record<string, unknown>>;
    /** Logger instance */
    log?: ILogger;
    /** Custom schema registry (default: singleton) */
    schemaRegistry?: ISchemaRegistry;
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

/**
 * Wrap the handler proxy so all method calls emit action events and surface
 * non-validation errors via the global error dialog automatically.
 * Field-validation errors are intentionally left for the form to handle.
 * The error is always re-thrown so callers can still react if needed.
 */
function wrapHandlerProxy(handler: AnyHandlerProxy['handler']): AnyHandlerProxy['handler'] {
    return new Proxy(handler, {
        get(target, prop: string | symbol) {
            if (typeof prop === 'symbol')
                return (target as Record<symbol, unknown>)[prop as symbol];
            const fn = (target as Record<string, unknown>)[prop as string];
            if (typeof fn !== 'function') return fn;
            const method = String(prop);
            return async (...args: unknown[]) => {
                const [params] = args;
                blongEvents.emit('action:before', {method, params});
                try {
                    const result = await (fn as (...a: unknown[]) => Promise<unknown>)(...args);
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
            };
        },
    }) as AnyHandlerProxy['handler'];
}

/** Provider component — wrap your application root with this */
export function BlongProvider({
    handlerProxy,
    schemaRegistry = defaultSchemaRegistry,
    log,
    children,
}: IBlongProviderProps) {
    const queryClient = useMemo(() => createQueryClient(), []);

    const {handler, config, lib, errors} = handlerProxy;

    const wrappedHandler = useMemo(() => wrapHandlerProxy(handler), [handler]);

    const value = useMemo<IBlongContextValue>(
        () => ({
            handler: wrappedHandler,
            config: config as Record<string, unknown> & {portal?: IBlongPortalConfig},
            lib,
            errors,
            schemaRegistry,
            queryClient,
            log,
        }),
        [wrappedHandler, config, lib, errors, schemaRegistry, queryClient, log],
    );

    return (
        <BlongContext value={value}>
            <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
        </BlongContext>
    );
}

/**
 * Create a minimal IHandlerProxy from a dispatch function.
 * Useful in tests and Storybook where the full runtime is not available.
 */
export function makeHandlerProxy(
    dispatch: (
        method: string,
        params?: Record<string, unknown>,
        $meta?: IMeta,
    ) => Promise<unknown>,
    config: {portal?: IBlongPortalConfig} & Record<string, unknown> = {},
): IHandlerProxy<{portal?: IBlongPortalConfig} & Record<string, unknown>> {
    const handler = new Proxy({} as Record<string, unknown>, {
        get(_, prop: string | symbol) {
            if (typeof prop === 'symbol') return undefined;
            const method = String(prop);
            return (params: Record<string, unknown>, $meta?: IMeta) =>
                dispatch(method, params, $meta);
        },
    });
    return {
        config,
        handler,
        lib: {} as AnyHandlerProxy['lib'],
        errors: {},
        utBus: {info: () => ({encrypt: {}, sign: {}})},
        gateway: {config: () => ({public: {sign: {}, encrypt: {}}})},
        apiSchema: {},
    } as unknown as IHandlerProxy<{portal?: IBlongPortalConfig} & Record<string, unknown>>;
}
