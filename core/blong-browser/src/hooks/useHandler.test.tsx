import {act, renderHook, waitFor} from '@testing-library/react';
import React from 'react';
import {describe, expect, it, vi} from 'vitest';
import {BlongUiProvider, type DispatchFn} from '../context/BlongUiContext.js';
import {useHandler, useHandlerCall, useHandlerMutation} from './useHandler.js';

function makeWrapper(dispatch: (m: string, p?: Record<string, unknown>) => Promise<unknown>) {
    // eslint-disable-next-line @eslint-react/component-hook-factories
    return function Wrapper({children}: {children: React.ReactNode}) {
        return (
            <BlongUiProvider
                dispatch={dispatch as DispatchFn}
                schemaUrl="/test.json"
            >
                {children}
            </BlongUiProvider>
        );
    };
}

describe('useHandler', () => {
    it('fetches and returns data', async () => {
        const dispatch = vi.fn().mockResolvedValue({items: [1, 2]});
        const {result} = renderHook(() => useHandler('my.list.find', {page: 1}), {
            wrapper: makeWrapper(dispatch),
        });
        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(result.current.data).toEqual({items: [1, 2]});
        expect(dispatch).toHaveBeenCalledWith('my.list.find', {page: 1}, undefined);
    });

    it('respects enabled=false option', async () => {
        const dispatch = vi.fn().mockResolvedValue({});
        renderHook(() => useHandler('skip.method', {}, {enabled: false}), {
            wrapper: makeWrapper(dispatch),
        });
        // Give it time to potentially call dispatch
        await new Promise(r => setTimeout(r, 20));
        expect(dispatch).not.toHaveBeenCalled();
    });

    it('returns error state when dispatch rejects', async () => {
        const dispatch = vi.fn().mockRejectedValue(new Error('Query failed'));
        const {result} = renderHook(() => useHandler('fail.method'), {
            wrapper: makeWrapper(dispatch),
        });
        await waitFor(() => expect(result.current.isError).toBe(true), {timeout: 5000});
    });
});

describe('useHandlerMutation', () => {
    it('calls dispatch and returns data on mutateAsync', async () => {
        const dispatch = vi.fn().mockResolvedValue({id: 10});
        const {result} = renderHook(
            () => useHandlerMutation<{id: number}, {name: string}>('entity.add'),
            {wrapper: makeWrapper(dispatch)},
        );
        let data: {id: number} | undefined;
        await act(async () => {
            data = await result.current.mutateAsync({name: 'Test'});
        });
        expect(data).toEqual({id: 10});
        expect(dispatch).toHaveBeenCalledWith('entity.add', {name: 'Test'}, undefined);
    });

    it('supports invalidateQueries list', async () => {
        const dispatch = vi.fn().mockResolvedValue({});
        const {result} = renderHook(() => useHandlerMutation('entity.remove', ['entity.find']), {
            wrapper: makeWrapper(dispatch),
        });
        await act(async () => {
            await result.current.mutateAsync({id: 1});
        });
        expect(dispatch).toHaveBeenCalled();
    });
});

describe('useHandlerCall', () => {
    it('returns an imperative function that calls dispatch', async () => {
        const dispatch = vi.fn().mockResolvedValue({status: 'ok'});
        const {result} = renderHook(() => useHandlerCall('action.run'), {
            wrapper: makeWrapper(dispatch),
        });
        let res: unknown;
        await act(async () => {
            res = await result.current({id: 5});
        });
        expect(res).toEqual({status: 'ok'});
        expect(dispatch).toHaveBeenCalledWith('action.run', {id: 5}, undefined);
    });

    it('calls dispatch with undefined params when no args passed', async () => {
        const dispatch = vi.fn().mockResolvedValue(null);
        const {result} = renderHook(() => useHandlerCall('bare.call'), {
            wrapper: makeWrapper(dispatch),
        });
        await act(async () => {
            await result.current();
        });
        expect(dispatch).toHaveBeenCalledWith('bare.call', undefined, undefined);
    });
});
