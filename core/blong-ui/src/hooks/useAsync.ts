/**
 * useAsync — async loader with status tracking.
 */
import {useEffect, useState, type DependencyList} from 'react';
import type {IBlongError} from '../types/action.js';

export type AsyncStatus = 'idle' | 'loading' | 'success' | 'error';

export interface IUseAsyncResult<T> {
    status: AsyncStatus;
    data?: T;
    error?: IBlongError | Error;
    loading: boolean;
    reload: () => void;
}

export function useAsync<T>(
    asyncFn: () => Promise<T>,
    deps: DependencyList = [],
): IUseAsyncResult<T> {
    const [status, setStatus] = useState<AsyncStatus>('idle');
    const [data, setData] = useState<T | undefined>();
    const [error, setError] = useState<IBlongError | Error | undefined>();
    const [reloadKey, setReloadKey] = useState(0);

    useEffect(() => {
        let cancelled = false;
        setStatus('loading');
        setError(undefined);

        asyncFn()
            .then(result => {
                if (!cancelled) {
                    setData(result);
                    setStatus('success');
                }
            })
            .catch(err => {
                if (!cancelled) {
                    setError(err as IBlongError | Error);
                    setStatus('error');
                }
            });

        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [...deps, reloadKey]);

    return {
        status,
        data,
        error,
        loading: status === 'loading' || status === 'idle',
        reload: () => setReloadKey(k => k + 1),
    };
}
