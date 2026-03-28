/**
 * useApi — TanStack Query wrappers for JSON-RPC calls via ky / fetch.
 *
 * Provides `useRpcQuery` (for reads) and `useRpcMutation` (for writes).
 * All calls go through the standard Blong JSON-RPC endpoint:
 *   POST /rpc/{subject}/{object}/{predicate}
 */

import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import type {UseMutationOptions, UseQueryOptions} from '@tanstack/react-query';

import type {FetchParams, FetchResponse, RpcError} from '../types.js';

// ── JSON-RPC transport ────────────────────────────────────────────────────────

/** JSON-RPC 2.0 request envelope. */
interface RpcRequest {
    jsonrpc: '2.0';
    method: string;
    params?: unknown;
    id: number;
}

/** JSON-RPC 2.0 response envelope. */
interface RpcResponse<T = unknown> {
    jsonrpc: '2.0';
    result?: T;
    error?: {code: number; message: string; data?: RpcError};
    id: number;
}

let rpcId = 0;

/** API configuration stored in context. */
export interface ApiConfig {
    /** Base URL of the Blong server (default: current origin). */
    baseUrl: string;
    /** Authorization token (JWT). */
    token?: string;
}

const defaultConfig: ApiConfig = {baseUrl: ''};

let globalConfig: ApiConfig = {...defaultConfig};

/** Set the global API configuration. */
export function setApiConfig(config: Partial<ApiConfig>): void {
    globalConfig = {...globalConfig, ...config};
}

/** Get the current API configuration. */
export function getApiConfig(): ApiConfig {
    return globalConfig;
}

/**
 * Convert a semantic triple method name to a URL path.
 * E.g. "user.user.get" → "/rpc/user/user/get"
 */
function methodToPath(method: string): string {
    return `/rpc/${method.replace(/\./g, '/')}`;
}

/**
 * Execute a JSON-RPC call against the Blong server.
 */
export async function rpcCall<T = unknown>(method: string, params?: unknown): Promise<T> {
    const config = getApiConfig();
    const url = `${config.baseUrl}${methodToPath(method)}`;
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
    };
    if (config.token) {
        headers['Authorization'] = `Bearer ${config.token}`;
    }

    const body: RpcRequest = {
        jsonrpc: '2.0',
        method,
        params,
        id: ++rpcId,
    };

    const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
    });

    if (!res.ok) {
        throw new Error(`RPC call failed: ${res.status} ${res.statusText}`);
    }

    const json = (await res.json()) as RpcResponse<T>;

    if (json.error) {
        const rpcError: RpcError = json.error.data ?? {
            type: 'rpc.error',
            message: json.error.message,
        };
        throw rpcError;
    }

    return json.result as T;
}

// ── Query hook ────────────────────────────────────────────────────────────────

/** Options for useRpcQuery. */
export interface UseRpcQueryOptions<T>
    extends Omit<UseQueryOptions<T, RpcError>, 'queryKey' | 'queryFn'> {
    /** JSON-RPC method name (semantic triple). */
    method: string;
    /** Parameters to pass to the RPC method. */
    params?: unknown;
}

/**
 * TanStack Query hook for JSON-RPC read operations.
 *
 * @example
 * ```tsx
 * const { data, isLoading } = useRpcQuery<User>({
 *     method: 'user.user.get',
 *     params: { userId: 42 },
 * });
 * ```
 */
export function useRpcQuery<T = unknown>(options: UseRpcQueryOptions<T>) {
    const {method, params, ...queryOptions} = options;

    return useQuery<T, RpcError>({
        queryKey: [method, params],
        queryFn: () => rpcCall<T>(method, params),
        ...queryOptions,
    });
}

// ── Fetch hook (for tables with pagination/sorting) ───────────────────────────

/** Options for useRpcFetch. */
export interface UseRpcFetchOptions<T>
    extends Omit<UseQueryOptions<FetchResponse<T>, RpcError>, 'queryKey' | 'queryFn'> {
    /** JSON-RPC method name (semantic triple). */
    method: string;
    /** Fetch parameters (orderBy, paging, criteria). */
    fetchParams?: FetchParams;
}

/**
 * TanStack Query hook for paginated data fetching (table data).
 *
 * @example
 * ```tsx
 * const { data } = useRpcFetch<User>({
 *     method: 'user.user.find',
 *     fetchParams: { paging: { pageSize: 20, pageNumber: 1 } },
 * });
 * ```
 */
export function useRpcFetch<T = Record<string, unknown>>(options: UseRpcFetchOptions<T>) {
    const {method, fetchParams, ...queryOptions} = options;

    return useQuery<FetchResponse<T>, RpcError>({
        queryKey: [method, 'fetch', fetchParams],
        queryFn: () => rpcCall<FetchResponse<T>>(method, fetchParams),
        ...queryOptions,
    });
}

// ── Mutation hook ─────────────────────────────────────────────────────────────

/** Options for useRpcMutation. */
export interface UseRpcMutationOptions<TData = unknown, TVariables = unknown>
    extends Omit<UseMutationOptions<TData, RpcError, TVariables>, 'mutationFn'> {
    /** JSON-RPC method name (semantic triple). */
    method: string;
    /** Query keys to invalidate on success. */
    invalidateKeys?: unknown[][];
}

/**
 * TanStack Query mutation hook for JSON-RPC write operations.
 *
 * @example
 * ```tsx
 * const mutation = useRpcMutation<User, CreateUserParams>({
 *     method: 'user.user.add',
 *     invalidateKeys: [['user.user.find']],
 * });
 * mutation.mutate({ userName: 'alice', email: 'alice@example.com' });
 * ```
 */
export function useRpcMutation<TData = unknown, TVariables = unknown>(
    options: UseRpcMutationOptions<TData, TVariables>,
) {
    const {method, invalidateKeys, ...mutationOptions} = options;
    const queryClient = useQueryClient();

    return useMutation<TData, RpcError, TVariables>({
        mutationFn: (variables: TVariables) => rpcCall<TData>(method, variables),
        onSuccess: (...args) => {
            if (invalidateKeys) {
                for (const key of invalidateKeys) {
                    void queryClient.invalidateQueries({queryKey: key});
                }
            }
            mutationOptions.onSuccess?.(...args);
        },
        ...mutationOptions,
    });
}
