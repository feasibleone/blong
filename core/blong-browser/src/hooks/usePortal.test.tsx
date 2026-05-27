import {act, renderHook} from '@testing-library/react';
import React from 'react';
import {describe, expect, it, vi} from 'vitest';
import {BlongProvider, makeHandlerProxy} from '../context/BlongContext.js';
import {useAppStore} from '../state/appStore.js';
import {usePortal} from './usePortal.js';

const wrapper = ({children}: {children: React.ReactNode}) => (
    <BlongProvider
        handlerProxy={makeHandlerProxy(vi.fn())}
    >
        {children}
    </BlongProvider>
);

describe('usePortal', () => {
    it('returns empty tabs initially', () => {
        // clean state
        act(() => {
            for (const tab of useAppStore.getState().portal.tabs) {
                useAppStore.getState().closeTab(tab.id);
            }
        });
        const {result} = renderHook(() => usePortal(), {wrapper});
        expect(result.current.tabs).toHaveLength(0);
        expect(result.current.activeTabId).toBeNull();
    });

    it('opens a tab', () => {
        act(() => {
            useAppStore
                .getState()
                .openTab({id: 'portal-t1', actionName: 'browse', title: 'Browse', params: {}});
        });
        const {result} = renderHook(() => usePortal(), {wrapper});
        expect(result.current.tabs.some(t => t.id === 'portal-t1')).toBe(true);
        expect(result.current.activeTabId).toBe('portal-t1');
        act(() => {
            useAppStore.getState().closeTab('portal-t1');
        });
    });

    it('closes a tab', () => {
        act(() => {
            useAppStore
                .getState()
                .openTab({id: 'portal-t2', actionName: 'a', title: 'A', params: {}});
        });
        const {result} = renderHook(() => usePortal(), {wrapper});
        act(() => {
            result.current.closeTab('portal-t2');
        });
        expect(result.current.tabs.some(t => t.id === 'portal-t2')).toBe(false);
    });

    it('sets active tab', () => {
        act(() => {
            useAppStore
                .getState()
                .openTab({id: 'portal-t3', actionName: 'a', title: 'A', params: {}});
            useAppStore
                .getState()
                .openTab({id: 'portal-t4', actionName: 'b', title: 'B', params: {}});
        });
        const {result} = renderHook(() => usePortal(), {wrapper});
        act(() => {
            result.current.setActiveTab('portal-t3');
        });
        expect(result.current.activeTabId).toBe('portal-t3');
        // cleanup
        act(() => {
            useAppStore.getState().closeTab('portal-t3');
            useAppStore.getState().closeTab('portal-t4');
        });
    });

    it('marks a tab dirty', () => {
        act(() => {
            useAppStore
                .getState()
                .openTab({id: 'portal-t5', actionName: 'edit', title: 'Edit', params: {}});
        });
        const {result} = renderHook(() => usePortal(), {wrapper});
        act(() => {
            result.current.setTabDirty('portal-t5', true);
        });
        expect(useAppStore.getState().portal.tabs.find(t => t.id === 'portal-t5')?.dirty).toBe(
            true,
        );
        act(() => {
            useAppStore.getState().closeTab('portal-t5');
        });
    });
});
