/**
 * useAction — primary hook for all action types.
 * Abstracts page actions, query actions, and mutation actions behind one API.
 */
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import {useCallback} from 'react';
import {useBlongUi} from '../context/BlongUiContext.js';
import {ulid} from '../lib/ulid.js';
import {useAppStore} from '../state/appStore.js';
import type {
    IAction,
    IBlongError,
    IMutationAction,
    IPageAction,
    IQueryAction,
    IUseActionResult,
} from '../types/action.js';
import type {ITab} from '../types/portal.js';

function isPageAction(a: IAction): a is IPageAction {
    return 'component' in a;
}
function isMutationAction(a: IAction): a is IMutationAction {
    return 'mutates' in a && a.mutates === true;
}
function isQueryAction(a: IAction): a is IQueryAction {
    return 'method' in a && !('mutates' in a);
}

/**
 * useAction — invoke or subscribe to an action by name.
 *
 * @param actionName - Registered action name (e.g. 'model.coral.fetch')
 * @param params - Static params merged with action-level params
 */
export function useAction<TResult = unknown>(
    actionName: string,
    params?: Record<string, unknown>,
): IUseActionResult<TResult> {
    const {dispatch} = useBlongUi();
    const queryClient = useQueryClient();
    const actions = useAppStore(s => s.actions);
    const openTab = useAppStore(s => s.openTab);
    const showError = useAppStore(s => s.showError);
    const action = actions[actionName];

    // Resolve method name for query/mutation actions
    const method =
        action && !isPageAction(action)
            ? (action.method ?? (action as IQueryAction).handler ?? actionName)
            : actionName;

    // Merge params: action-level static params then call-time params
    const mergedParams = useCallback(
        (callParams?: Record<string, unknown>) => {
            const actionParams =
                action && !isPageAction(action) && action.params
                    ? typeof action.params === 'function'
                        ? action.params(callParams ?? {})
                        : action.params
                    : {};
            return {
                ...(params ?? {}),
                ...(actionParams as Record<string, unknown>),
                ...(callParams ?? {}),
            };
        },
        [action, params],
    );

    // ── Page action ──────────────────────────────────────────────────────
    if (!action || isPageAction(action)) {
        const open = useCallback(
            async (callParams?: Record<string, unknown>) => {
                const resolved = mergedParams(callParams);
                if (action && isPageAction(action)) {
                    // Resolve component metadata
                    try {
                        const component = await action.component();
                        const tab: ITab = {
                            id: ulid(),
                            actionName,
                            params: resolved,
                            title: action.title,
                            component,
                        };
                        openTab(tab);
                    } catch (err) {
                        showError({type: 'error.component.load', message: String(err)});
                    }
                } else {
                    // No action definition — dispatch directly
                    await dispatch(`component/${actionName}`, resolved);
                }
            },
            [action, actionName, mergedParams, openTab, showError, dispatch],
        );

        return {
            call: open,
            open,
            loading: false,
        };
    }

    // ── Query action ─────────────────────────────────────────────────────
    if (isQueryAction(action)) {
        const queryKey = [method, params ?? {}];
        const {data, isLoading, error, refetch} = useQuery<TResult, IBlongError>({
            queryKey,
            queryFn: () => dispatch(method, mergedParams()) as Promise<TResult>,
            enabled: true,
        });

        const call = useCallback(
            (callParams?: Record<string, unknown>) => {
                return dispatch(method, mergedParams(callParams)) as Promise<TResult>;
            },
            [method, mergedParams, dispatch],
        );

        return {
            call,
            open: call as IUseActionResult<TResult>['open'],
            data,
            loading: isLoading,
            error: error ?? undefined,
            refetch: () => refetch().then(r => r.data!),
        };
    }

    // ── Mutation action ───────────────────────────────────────────────────
    if (isMutationAction(action)) {
        const {mutateAsync, isPending, error} = useMutation<
            TResult,
            IBlongError,
            Record<string, unknown>
        >({
            mutationFn: callParams =>
                dispatch(method, mergedParams(callParams)) as Promise<TResult>,
            onSuccess: () => {
                // Invalidate related query caches
                const invalidates = (action as IMutationAction).invalidates ?? [];
                for (const name of invalidates) {
                    const invalidAction = actions[name];
                    const invalidMethod =
                        invalidAction && !isPageAction(invalidAction)
                            ? (invalidAction.method ??
                              (invalidAction as IQueryAction).handler ??
                              name)
                            : name;
                    void queryClient.invalidateQueries({queryKey: [invalidMethod]});
                }
            },
        });

        const call = useCallback(
            (callParams?: Record<string, unknown>) => mutateAsync(callParams ?? {}),
            [mutateAsync],
        );

        return {
            call,
            open: call as IUseActionResult<TResult>['open'],
            loading: isPending,
            error: error ?? undefined,
        };
    }

    // Fallback
    return {call: async () => undefined, open: () => undefined, loading: false};
}
