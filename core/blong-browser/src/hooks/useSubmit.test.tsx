import {act, renderHook} from '@testing-library/react';
import React from 'react';
import {describe, expect, it, vi} from 'vitest';
import {BlongProvider, makeHandlerProxy} from '../context/BlongContext.js';
import {useAppStore} from '../state/appStore.js';
import {useSubmit} from './useSubmit.js';

const wrapper = ({children}: {children: React.ReactNode}) => (
    <BlongProvider
        handlerProxy={makeHandlerProxy(vi.fn())}
    >
        {children}
    </BlongProvider>
);

describe('useSubmit', () => {
    it('calls the fn and shows success toast', async () => {
        act(() => {
            useAppStore.getState().clearAllToasts();
        });
        const fn = vi.fn().mockResolvedValue({ok: true});
        const {result} = renderHook(() => useSubmit(fn), {wrapper});

        await act(async () => {
            await result.current.submit({name: 'Alice'});
        });

        expect(fn).toHaveBeenCalledWith({name: 'Alice'});
        const toasts = useAppStore.getState().toasts;
        expect(toasts.some(t => t.severity === 'success')).toBe(true);
        act(() => {
            useAppStore.getState().clearAllToasts();
        });
    });

    it('shows error toast when fn rejects', async () => {
        act(() => {
            useAppStore.getState().clearAllToasts();
        });
        const fn = vi.fn().mockRejectedValue(new Error('Server error'));
        const {result} = renderHook(() => useSubmit(fn), {wrapper});

        await act(async () => {
            await result.current.submit({}).catch(() => {});
        });

        const toasts = useAppStore.getState().toasts;
        expect(toasts.some(t => t.severity === 'error')).toBe(true);
        act(() => {
            useAppStore.getState().clearAllToasts();
        });
    });

    it('sets submitting=true during execution and false after', async () => {
        let resolveFn!: () => void;
        const fn = vi.fn().mockReturnValue(
            new Promise<void>(r => {
                resolveFn = r;
            }),
        );
        const {result} = renderHook(() => useSubmit(fn), {wrapper});

        expect(result.current.submitting).toBe(false);

        let submitPromise: Promise<unknown>;
        act(() => {
            submitPromise = result.current.submit({});
        });
        expect(result.current.submitting).toBe(true);

        await act(async () => {
            resolveFn();
            await submitPromise;
        });
        expect(result.current.submitting).toBe(false);
        act(() => {
            useAppStore.getState().clearAllToasts();
        });
    });

    it('calls onSuccess callback on success', async () => {
        const fn = vi.fn().mockResolvedValue('result');
        const onSuccess = vi.fn();
        const {result} = renderHook(() => useSubmit(fn, {onSuccess}), {wrapper});
        await act(async () => {
            await result.current.submit({});
        });
        expect(onSuccess).toHaveBeenCalledWith('result');
        act(() => {
            useAppStore.getState().clearAllToasts();
        });
    });

    it('calls onError callback on failure', async () => {
        const fn = vi.fn().mockRejectedValue(new Error('fail'));
        const onError = vi.fn();
        const {result} = renderHook(() => useSubmit(fn, {onError}), {wrapper});
        await act(async () => {
            await result.current.submit({}).catch(() => {});
        });
        expect(onError).toHaveBeenCalled();
        act(() => {
            useAppStore.getState().clearAllToasts();
        });
    });

    it('uses custom success and error messages', async () => {
        act(() => {
            useAppStore.getState().clearAllToasts();
        });
        const fn = vi.fn().mockResolvedValue(null);
        const {result} = renderHook(() => useSubmit(fn, {successMessage: 'Custom success!'}), {
            wrapper,
        });
        await act(async () => {
            await result.current.submit({});
        });
        const toasts = useAppStore.getState().toasts;
        expect(toasts.some(t => t.summary === 'Custom success!')).toBe(true);
        act(() => {
            useAppStore.getState().clearAllToasts();
        });
    });
});
