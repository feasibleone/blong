/**
 * useHandler / useHandlerMutation — low-level direct registry dispatch hooks.
 * Use these only when the action-based abstractions are not suitable.
 */
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import {useCallback} from 'react';
import {useBlong} from '../context/BlongContext.js';
import type {IBlongError} from '../types/action.js';

/**
 * useHandler — subscribe to a registry method result.
 * Equivalent to useQuery but directly calling the registry.
 */
export function useHandler<TResult = unknown>(
    method: string,
    params?: Record<string, unknown>,
    options?: {enabled?: boolean; staleTime?: number},
) {
    const {handler} = useBlong();
    return useQuery<TResult, IBlongError>({
        queryKey: [method, params ?? {}],
        queryFn: () => handler[method](params ?? {}, {}) as Promise<TResult>,
        enabled: options?.enabled ?? true,
        staleTime: options?.staleTime,
    });
}

/**
 * useHandlerMutation — call a registry method as a mutation.
 */
export function useHandlerMutation<
    TResult = unknown,
    TParams extends Record<string, unknown> = Record<string, unknown>,
>(method: string, invalidateQueries?: string[]) {
    const {handler} = useBlong();
    const queryClient = useQueryClient();

    return useMutation<TResult, IBlongError, TParams>({
        mutationFn: params => handler[method](params, {}) as Promise<TResult>,
        onSuccess: () => {
            for (const key of invalidateQueries ?? []) {
                void queryClient.invalidateQueries({queryKey: [key]});
            }
        },
    });
}

/** useHandler as an imperative call (no subscription) */
export function useHandlerCall<TResult = unknown>(method: string) {
    const {handler} = useBlong();
    return useCallback(
        (params?: Record<string, unknown>) => handler[method](params ?? {}, {}) as Promise<TResult>,
        [handler, method],
    );
}
