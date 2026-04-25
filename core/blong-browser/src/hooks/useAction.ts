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

function isComponentAction(a?: IAction): a is IPageAction {
    return !a || 'component' in a;
}
function isMutationAction(a: IAction): a is IMutationAction {
    return a && 'mutates' in a && a.mutates === true;
}
function isQueryAction(a: IAction): a is IQueryAction {
    return a && 'method' in a && !('mutates' in a);
}

/**
 * useAction — invoke or subscribe to an action by name.
 *
 * @param actionName - Registered action name (e.g. 'model.coral.fetch')
 * @param params - Static params merged with action-level params
 */
export function useAction<TResult = unknown>(
    actionName: string,
    type?: 'page' | 'query' | 'mutation',
    params?: Record<string, unknown>,
): IUseActionResult<TResult> {
    const {dispatch} = useBlongUi();
    const queryClient = useQueryClient();
    const actions = useAppStore(s => s.actions);
    const openTab = useAppStore(s => s.openTab);
    const showError = useAppStore(s => s.showError);
    const action =
        actions[actionName] ??
        (actionName &&
            !actionName.startsWith('component') &&
            ({
                method: actionName,
                type: type || 'query',
                ...(type === 'mutation' && {mutates: true}),
            } as IAction));

    // Resolve method name for query/mutation actions
    const method = !isComponentAction(action)
        ? (action.method ?? (action as IQueryAction).handler ?? actionName)
        : actionName;

    // Merge params: action-level static params then call-time params
    const mergedParams = useCallback(
        (callParams?: Record<string, unknown>) => {
            const actionParams =
                !isComponentAction(action) && action.params
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

    // ── Page / open action ─────────────────────────────────────────────────
    // Always declared unconditionally — used when action is absent or page-type.
    const open = useCallback(
        async (callParams?: Record<string, unknown>) => {
            const resolved = mergedParams(callParams);
            const componentAction: IAction | undefined =
                action || (await dispatch(actionName, resolved));
            if (componentAction && isComponentAction(componentAction)) {
                try {
                    const component = await componentAction.component();
                    const tab: ITab = {
                        id: ulid(),
                        actionName,
                        params: resolved,
                        title: componentAction.title,
                        component,
                    };
                    openTab(tab);
                } catch (err) {
                    showError({type: 'error.component.load', message: String(err)});
                }
            } else {
                showError({
                    type: 'error.action.notfound',
                    message: `Action "${actionName}" not found`,
                });
            }
        },
        [action, actionName, mergedParams, openTab, showError, dispatch],
    );

    // ── Query action ─────────────────────────────────────────────────────
    // Always declared unconditionally; enabled only when action is a query action.
    const {
        data,
        isLoading,
        error: queryError,
        refetch,
    } = useQuery<TResult, IBlongError>({
        queryKey: [method, params ?? {}],
        queryFn: () => dispatch(method, mergedParams()) as Promise<TResult>,
        enabled: !!action && isQueryAction(action),
    });

    const queryCall = useCallback(
        (callParams?: Record<string, unknown>) =>
            dispatch(method, mergedParams(callParams)) as Promise<TResult>,
        [method, mergedParams, dispatch],
    );

    // ── Mutation action ────────────────────────────────────────────────────
    // Always declared unconditionally; only triggered when mutateAsync is called.
    const {
        mutateAsync,
        isPending,
        error: mutationError,
    } = useMutation<TResult, IBlongError, Record<string, unknown>>({
        mutationFn: callParams => dispatch(method, mergedParams(callParams)) as Promise<TResult>,
        onSuccess: () => {
            if (isMutationAction(action)) {
                const invalidates = (action as IMutationAction).invalidates ?? [];
                for (const name of invalidates) {
                    const invalidAction = actions[name];
                    const invalidMethod =
                        invalidAction && !isComponentAction(invalidAction)
                            ? (invalidAction.method ??
                              (invalidAction as IQueryAction).handler ??
                              name)
                            : name;
                    void queryClient.invalidateQueries({queryKey: [invalidMethod]});
                }
            }
        },
    });

    const mutationCall = useCallback(
        (callParams?: Record<string, unknown>) => mutateAsync(callParams ?? {}),
        [mutateAsync],
    );

    // ── Return based on action type ────────────────────────────────────────
    if (actionName && isComponentAction(action)) {
        return {call: open, open, loading: false};
    }

    if (isQueryAction(action)) {
        return {
            call: queryCall,
            open: queryCall as IUseActionResult<TResult>['open'],
            data,
            loading: isLoading,
            error: queryError ?? undefined,
            refetch: () => refetch().then(r => r.data!),
        };
    }

    if (isMutationAction(action)) {
        return {
            call: mutationCall,
            open: mutationCall as IUseActionResult<TResult>['open'],
            loading: isPending,
            error: mutationError ?? undefined,
        };
    }

    // Fallback
    return {call: async () => undefined, open: () => undefined, loading: false};
}
