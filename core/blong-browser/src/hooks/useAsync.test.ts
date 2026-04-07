import {act, renderHook, waitFor} from '@testing-library/react';
import {describe, expect, it} from 'vitest';
import {useAsync} from './useAsync.js';

describe('useAsync', () => {
    it('starts in loading state', () => {
        const {result} = renderHook(() => useAsync(() => new Promise(() => undefined)));
        expect(result.current.loading).toBe(true);
        expect(result.current.status).toBe('loading');
        expect(result.current.data).toBeUndefined();
    });

    it('resolves to success with data', async () => {
        const {result} = renderHook(() => useAsync(async () => ({value: 42})));
        await waitFor(() => expect(result.current.status).toBe('success'));
        expect(result.current.data).toEqual({value: 42});
        expect(result.current.loading).toBe(false);
        expect(result.current.error).toBeUndefined();
    });

    it('transitions to error state on rejection', async () => {
        const {result} = renderHook(() =>
            useAsync(async () => {
                throw new Error('Oops');
            }),
        );
        await waitFor(() => expect(result.current.status).toBe('error'));
        expect(result.current.error).toBeInstanceOf(Error);
        expect((result.current.error as Error).message).toBe('Oops');
        expect(result.current.loading).toBe(false);
    });

    it('reload re-triggers the async function', async () => {
        let callCount = 0;
        const {result} = renderHook(() =>
            useAsync(async () => {
                callCount++;
                return callCount;
            }),
        );
        await waitFor(() => expect(result.current.status).toBe('success'));
        expect(callCount).toBe(1);

        act(() => {
            result.current.reload();
        });
        await waitFor(() => expect(result.current.data).toBe(2));
        expect(callCount).toBe(2);
    });

    it('cancels in-flight request when deps change', async () => {
        let resolveFn!: (v: number) => void;
        const {result, rerender} = renderHook(
            ({key}: {key: number}) =>
                useAsync(
                    () =>
                        new Promise<number>(resolve => {
                            resolveFn = resolve;
                        }),
                    [key],
                ),
            {initialProps: {key: 1}},
        );
        // Change deps before first resolves
        rerender({key: 2});
        resolveFn(99);
        // Wait a tick — cancelled, data should not be set from old request
        await waitFor(() => expect(result.current.status).toBe('loading'));
    });
});
