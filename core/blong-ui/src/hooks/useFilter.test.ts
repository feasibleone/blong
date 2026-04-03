import {act, renderHook} from '@testing-library/react';
import {describe, expect, it} from 'vitest';
import {useFilter} from './useFilter.js';

describe('useFilter', () => {
    it('initialises with default state', () => {
        const {result} = renderHook(() => useFilter());
        expect(result.current.filterState.filter).toEqual({});
        expect(result.current.filterState.sort).toBeNull();
        expect(result.current.filterState.page).toBe(1);
        expect(result.current.filterState.pageSize).toBe(20);
    });

    it('accepts initial filter and pageSize', () => {
        const {result} = renderHook(() => useFilter({name: 'test'}, 50));
        expect(result.current.filterState.filter).toEqual({name: 'test'});
        expect(result.current.filterState.pageSize).toBe(50);
    });

    it('setFilter merges new values and resets page to 1', () => {
        const {result} = renderHook(() => useFilter<{name?: string; status?: string}>());
        act(() => {
            result.current.setFilter({name: 'Alice'});
        });
        expect(result.current.filterState.filter).toEqual({name: 'Alice'});
        expect(result.current.filterState.page).toBe(1);

        act(() => {
            result.current.setPage(3);
        });
        expect(result.current.filterState.page).toBe(3);

        act(() => {
            result.current.setFilter({status: 'active'});
        });
        expect(result.current.filterState.filter).toEqual({name: 'Alice', status: 'active'});
        expect(result.current.filterState.page).toBe(1); // reset
    });

    it('setSort updates sort and resets page to 1', () => {
        const {result} = renderHook(() => useFilter());
        act(() => {
            result.current.setPage(5);
        });
        act(() => {
            result.current.setSort({field: 'name', order: 1});
        });
        expect(result.current.filterState.sort).toEqual({field: 'name', order: 1});
        expect(result.current.filterState.page).toBe(1);
    });

    it('setSort can clear sort with null', () => {
        const {result} = renderHook(() => useFilter());
        act(() => {
            result.current.setSort({field: 'id', order: -1});
        });
        act(() => {
            result.current.setSort(null);
        });
        expect(result.current.filterState.sort).toBeNull();
    });

    it('setPage updates the page', () => {
        const {result} = renderHook(() => useFilter());
        act(() => {
            result.current.setPage(7);
        });
        expect(result.current.filterState.page).toBe(7);
    });

    it('setPageSize updates pageSize and resets page to 1', () => {
        const {result} = renderHook(() => useFilter());
        act(() => {
            result.current.setPage(4);
        });
        act(() => {
            result.current.setPageSize(100);
        });
        expect(result.current.filterState.pageSize).toBe(100);
        expect(result.current.filterState.page).toBe(1);
    });

    it('resetFilter resets filter to initial values and page to 1', () => {
        const {result} = renderHook(() => useFilter<{name?: string}>({name: 'initial'}));
        act(() => {
            result.current.setFilter({name: 'changed'});
        });
        act(() => {
            result.current.setPage(3);
        });
        act(() => {
            result.current.resetFilter();
        });
        expect(result.current.filterState.filter).toEqual({name: 'initial'});
        expect(result.current.filterState.page).toBe(1);
    });

    it('buildParams returns the current filter state', () => {
        const {result} = renderHook(() => useFilter<{type: string}>({type: 'A'}));
        act(() => {
            result.current.setSort({field: 'id', order: -1});
            result.current.setPage(2);
        });
        const params = result.current.buildParams();
        expect(params.filter).toEqual({type: 'A'});
        expect(params.sort).toEqual({field: 'id', order: -1});
        expect(params.page).toBe(2);
    });
});
