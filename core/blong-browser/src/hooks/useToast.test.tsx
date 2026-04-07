import {act, renderHook} from '@testing-library/react';
import React from 'react';
import {describe, expect, it, vi} from 'vitest';
import {BlongUiProvider} from '../context/BlongUiContext.js';
import {useAppStore} from '../state/appStore.js';
import {useToast} from './useToast.js';

const wrapper = ({children}: {children: React.ReactNode}) => (
    <BlongUiProvider
        dispatch={vi.fn()}
        schemaUrl="/test.json"
    >
        {children}
    </BlongUiProvider>
);

describe('useToast', () => {
    it('shows a success toast', () => {
        act(() => {
            useAppStore.getState().clearAllToasts();
        });
        const {result} = renderHook(() => useToast(), {wrapper});
        act(() => {
            result.current.success('Saved!');
        });
        const toasts = useAppStore.getState().toasts;
        expect(toasts.some(t => t.severity === 'success' && t.summary === 'Saved!')).toBe(true);
        act(() => {
            useAppStore.getState().clearAllToasts();
        });
    });

    it('shows an error toast', () => {
        act(() => {
            useAppStore.getState().clearAllToasts();
        });
        const {result} = renderHook(() => useToast(), {wrapper});
        act(() => {
            result.current.error('Error!', 'Detail info');
        });
        const toasts = useAppStore.getState().toasts;
        expect(toasts.some(t => t.severity === 'error')).toBe(true);
        act(() => {
            useAppStore.getState().clearAllToasts();
        });
    });

    it('shows an info toast', () => {
        act(() => {
            useAppStore.getState().clearAllToasts();
        });
        const {result} = renderHook(() => useToast(), {wrapper});
        act(() => {
            result.current.info('Note');
        });
        const toasts = useAppStore.getState().toasts;
        expect(toasts.some(t => t.severity === 'info')).toBe(true);
        act(() => {
            useAppStore.getState().clearAllToasts();
        });
    });

    it('shows a warn toast', () => {
        act(() => {
            useAppStore.getState().clearAllToasts();
        });
        const {result} = renderHook(() => useToast(), {wrapper});
        act(() => {
            result.current.warn('Warning!');
        });
        const toasts = useAppStore.getState().toasts;
        expect(toasts.some(t => t.severity === 'warn')).toBe(true);
        act(() => {
            useAppStore.getState().clearAllToasts();
        });
    });

    it('clears all toasts', () => {
        const {result} = renderHook(() => useToast(), {wrapper});
        act(() => {
            result.current.success('A');
            result.current.error('B');
        });
        act(() => {
            result.current.clearAll();
        });
        expect(useAppStore.getState().toasts).toHaveLength(0);
    });

    it('shows a custom toast via show()', () => {
        act(() => {
            useAppStore.getState().clearAllToasts();
        });
        const {result} = renderHook(() => useToast(), {wrapper});
        act(() => {
            result.current.show({severity: 'success', summary: 'Custom', detail: 'Details'});
        });
        const toasts = useAppStore.getState().toasts;
        expect(toasts.some(t => t.summary === 'Custom')).toBe(true);
        act(() => {
            useAppStore.getState().clearAllToasts();
        });
    });
});
