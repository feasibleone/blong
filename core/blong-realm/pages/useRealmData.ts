import {useCallback, useEffect, useState} from 'react';
import {useBlong} from '@feasibleone/blong-browser';

/**
 * The realm's pages all do the same three things: ask the service through
 * `blong.*`, show what came back, and show the failure when it did not come back
 * at all. Keeping that in one place is what lets each page be about its subject.
 *
 * Two properties matter:
 *
 * - **A failure is a state, not an exception.** Every read here is a call to
 *   another process; a service that is not running, a role that was refused, and
 *   a kind nobody has observed are three different answers, and a page that
 *   rendered only the first would report the other two as "nothing to show".
 * - **Loading is derived, not set.** Whether an answer belongs to the request
 *   that is outstanding is a comparison of keys, so a change of parameters needs
 *   no extra render pass to stop showing the previous answer — the same rule the
 *   diagram renderer follows.
 */

/** The runtime handler proxy: any method key, called with (params, $meta). */
type HandlerCall = (params: object, meta: object) => Promise<unknown>;

function caller(handler: unknown): (method: string, params: object) => Promise<unknown> {
    return async (method, params) => {
        const call = (handler as Record<string, HandlerCall> | undefined)?.[method];
        if (typeof call !== 'function') {
            throw new Error(`the ${method} method is not available in this portal`);
        }
        return call(params, {});
    };
}

export interface IRealmRead<T> {
    data?: T;
    error?: string;
    loading: boolean;
    reload: () => void;
}

/** Read one `blong.*` method, re-reading when the parameters change. */
export function useRealmRead<T>(method: string, params: object = {}): IRealmRead<T> {
    const {handler} = useBlong();
    const key = JSON.stringify(params);
    const [state, setState] = useState<{key?: string; data?: T; error?: string}>({});
    const [nonce, setNonce] = useState(0);

    useEffect(() => {
        let cancelled = false;
        void (async () => {
            try {
                const data = (await caller(handler)(method, JSON.parse(key) as object)) as T;
                if (!cancelled) setState({key, data});
            } catch (error) {
                if (!cancelled) setState({key, error: String(error)});
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [handler, method, key, nonce]);

    return {
        data: state.key === key ? state.data : undefined,
        error: state.key === key ? state.error : undefined,
        loading: state.key !== key,
        reload: useCallback(() => setNonce(value => value + 1), []),
    };
}

/** Call one `blong.*` method when something happens, rather than when a page renders. */
export function useRealmCall(): (
    method: string,
    params: object,
) => Promise<{data?: unknown; error?: string}> {
    const {handler} = useBlong();
    return useCallback(
        async (method: string, params: object) => {
            try {
                return {data: await caller(handler)(method, params)};
            } catch (error) {
                return {error: String(error)};
            }
        },
        [handler],
    );
}
