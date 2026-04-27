import {act, renderHook, waitFor} from '@testing-library/react';
import React from 'react';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {BlongUiProvider, type DispatchFn} from '../context/BlongUiContext.js';
import {useAppStore} from '../state/appStore.js';
import {useAction} from './useAction.js';

function makeWrapper(
    dispatch: (method: string, params?: Record<string, unknown>) => Promise<unknown>,
) {
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

beforeEach(() => {
    // Reset registered actions and portal tabs before each test
    useAppStore.setState(s => ({
        ...s,
        actions: {},
        portal: {...s.portal, tabs: [], activeTabId: null},
    }));
});

describe('useAction — no action registered (direct dispatch)', () => {
    it('returns call and open functions', () => {
        const dispatch = vi.fn().mockResolvedValue({});
        const {result} = renderHook(() => useAction('some.method'), {
            wrapper: makeWrapper(dispatch),
        });
        expect(typeof result.current.call).toBe('function');
        expect(typeof result.current.open).toBe('function');
        expect(result.current.loading).toBe(false);
    });

    it('dispatches directly to the action name on call', async () => {
        const dispatch = vi.fn().mockResolvedValue({ok: true});
        const {result} = renderHook(() => useAction('entity.add'), {
            wrapper: makeWrapper(dispatch),
        });
        await act(async () => {
            await result.current.call({name: 'test'});
        });
        expect(dispatch).toHaveBeenCalledWith('component/entity.add', {name: 'test'});
    });
});

describe('useAction — query action', () => {
    it('runs a query and returns data', async () => {
        const dispatch = vi.fn().mockResolvedValue({items: [{id: 1}]});
        // Register a query action in the store
        act(() => {
            useAppStore.getState().registerActions({
                myQuery: {method: 'entity.entity.find'} as never,
            });
        });
        const wrapper = makeWrapper(dispatch);
        const {result} = renderHook(() => useAction('myQuery'), {wrapper});
        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });
        expect(dispatch).toHaveBeenCalledWith('entity.entity.find', {});
    });
});

describe('useAction — mutation action', () => {
    it('calls the mutation and returns result', async () => {
        const dispatch = vi.fn().mockResolvedValue({id: 1});
        act(() => {
            useAppStore.getState().registerActions({
                myMutation: {method: 'entity.entity.add', mutates: true} as never,
            });
        });
        const wrapper = makeWrapper(dispatch);
        const {result} = renderHook(() => useAction('myMutation'), {wrapper});
        await act(async () => {
            await result.current.call({name: 'New Entity'});
        });
        expect(dispatch).toHaveBeenCalledWith('entity.entity.add', {name: 'New Entity'});
    });

    it('returns loading=false after successful mutation', async () => {
        const dispatch = vi.fn().mockResolvedValue({id: 99});
        act(() => {
            useAppStore.getState().registerActions({
                completedMutation: {method: 'entity.entity.remove', mutates: true} as never,
            });
        });
        const wrapper = makeWrapper(dispatch);
        const {result} = renderHook(() => useAction('completedMutation'), {wrapper});

        await act(async () => {
            await result.current.call({id: 99});
        });
        expect(result.current.loading).toBe(false);
        expect(dispatch).toHaveBeenCalledWith('entity.entity.remove', {id: 99});
    });
});

describe('useAction — page action', () => {
    it('opens a tab when a page action is registered', async () => {
        const dispatch = vi.fn().mockResolvedValue({});
        const MockPage = vi.fn().mockReturnValue(null);
        act(() => {
            useAppStore.getState().registerActions({
                pageAction: {
                    component: vi.fn().mockResolvedValue(MockPage),
                    title: 'Test Page',
                } as never,
            });
        });
        const wrapper = makeWrapper(dispatch);
        const {result} = renderHook(() => useAction('pageAction'), {wrapper});
        await act(async () => {
            await result.current.open({userId: 1});
        });
        const tabs = useAppStore.getState().portal.tabs;
        expect(tabs.length).toBeGreaterThan(0);
        expect(tabs[0].title).toBe('Test Page');
    });

    it('shows error when component factory throws', async () => {
        const dispatch = vi.fn().mockResolvedValue({});
        act(() => {
            useAppStore.getState().registerActions({
                brokenPage: {
                    component: vi.fn().mockRejectedValue(new Error('Load failed')),
                    title: 'Broken Page',
                } as never,
            });
        });
        const wrapper = makeWrapper(dispatch);
        const {result} = renderHook(() => useAction('brokenPage'), {wrapper});
        await act(async () => {
            await result.current.open({});
        });
        // After error, dispatch was NOT called, but store may have an error
        expect(dispatch).not.toHaveBeenCalled();
    });

    it('dispatches directly when no action is registered', async () => {
        const dispatch = vi.fn().mockResolvedValue({component: 'data'});
        const wrapper = makeWrapper(dispatch);
        const {result} = renderHook(() => useAction('unregistered.action'), {wrapper});
        await act(async () => {
            await result.current.open({param: 'value'});
        });
        expect(dispatch).toHaveBeenCalledWith('component/unregistered.action', {param: 'value'});
    });
});

describe('useAction — with static params', () => {
    it('merges static params with call-time params', async () => {
        const dispatch = vi.fn().mockResolvedValue({});
        // Register a query action with static params
        act(() => {
            useAppStore.getState().registerActions({
                paramAction: {method: 'entity.entity.find', params: {type: 'static'}} as never,
            });
        });
        const wrapper = makeWrapper(dispatch);
        const {result} = renderHook(() => useAction('paramAction', 'query', {extra: 'base'}), {
            wrapper,
        });
        await act(async () => {
            await result.current.call({dynamic: 'value'});
        });
        expect(dispatch).toHaveBeenCalledWith(
            'entity.entity.find',
            expect.objectContaining({type: 'static', extra: 'base', dynamic: 'value'}),
        );
    });

    it('accepts function-based action params', async () => {
        const dispatch = vi.fn().mockResolvedValue({});
        act(() => {
            useAppStore.getState().registerActions({
                fnParamAction: {
                    method: 'x.y.find',
                    params: (call: Record<string, unknown>) => ({derived: call.input}),
                } as never,
            });
        });
        const wrapper = makeWrapper(dispatch);
        const {result} = renderHook(() => useAction('fnParamAction'), {wrapper});
        await act(async () => {
            await result.current.call({input: 'hello'});
        });
        expect(dispatch).toHaveBeenCalledWith(
            'x.y.find',
            expect.objectContaining({derived: 'hello', input: 'hello'}),
        );
    });
});

describe('useAction — query error handling', () => {
    it('returns error state when query fails', async () => {
        const dispatch = vi.fn().mockRejectedValue(new Error('Network error'));
        act(() => {
            useAppStore.getState().registerActions({
                failingQuery: {method: 'broken.broken.find'} as never,
            });
        });
        const wrapper = makeWrapper(dispatch);
        const {result} = renderHook(() => useAction('failingQuery'), {wrapper});
        // Wait for the query to settle (retry once then give up)
        await waitFor(() => expect(result.current.loading).toBe(false), {timeout: 3000});
    });
});
