/**
 * useFilter — DataTable filter/sort/pagination state.
 */
import {useCallback, useState} from 'react';

export interface IFilterState<T = Record<string, unknown>> {
    filter: T;
    sort: {field: string; order: 1 | -1} | null;
    page: number;
    pageSize: number;
}

export interface IUseFilterResult<T = Record<string, unknown>> {
    filterState: IFilterState<T>;
    setFilter: (filter: Partial<T>) => void;
    setSort: (sort: IFilterState['sort']) => void;
    setPage: (page: number) => void;
    setPageSize: (size: number) => void;
    resetFilter: () => void;
    /** Build params object for a fetch call */
    buildParams: () => IFilterState<T>;
}

export function useFilter<T extends Record<string, unknown>>(
    initialFilter?: Partial<T>,
    initialPageSize = 20,
): IUseFilterResult<T> {
    const [filterState, setFilterState] = useState<IFilterState<T>>({
        filter: (initialFilter ?? {}) as T,
        sort: null,
        page: 1,
        pageSize: initialPageSize,
    });

    const setFilter = useCallback((filter: Partial<T>) => {
        setFilterState(prev => ({...prev, filter: {...prev.filter, ...filter}, page: 1}));
    }, []);

    const setSort = useCallback((sort: IFilterState['sort']) => {
        setFilterState(prev => ({...prev, sort, page: 1}));
    }, []);

    const setPage = useCallback((page: number) => {
        setFilterState(prev => ({...prev, page}));
    }, []);

    const setPageSize = useCallback((pageSize: number) => {
        setFilterState(prev => ({...prev, pageSize, page: 1}));
    }, []);

    const resetFilter = useCallback(() => {
        setFilterState(prev => ({
            ...prev,
            filter: (initialFilter ?? {}) as T,
            page: 1,
        }));
    }, [initialFilter]);

    return {
        filterState,
        setFilter,
        setSort,
        setPage,
        setPageSize,
        resetFilter,
        buildParams: () => filterState,
    };
}
