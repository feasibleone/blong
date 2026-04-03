import {act, renderHook} from '@testing-library/react';
import {describe, expect, it} from 'vitest';
import {useAppStore} from '../state/appStore.js';
import {usePermission} from './usePermission.js';

describe('usePermission', () => {
    it('returns true when permission is null (no restriction)', () => {
        const {result} = renderHook(() => usePermission(null));
        expect(result.current).toBe(true);
    });

    it('returns true when permission is undefined', () => {
        const {result} = renderHook(() => usePermission(undefined));
        expect(result.current).toBe(true);
    });

    it('returns boolean override directly', () => {
        const {result: t} = renderHook(() => usePermission(true));
        expect(t.current).toBe(true);
        const {result: f} = renderHook(() => usePermission(false));
        expect(f.current).toBe(false);
    });

    it('returns false when named permission is absent from store', () => {
        act(() => {
            useAppStore.getState().setPermissions({});
        });
        const {result} = renderHook(() => usePermission('portal.design'));
        expect(result.current).toBe(false);
    });

    it('returns true when named permission is granted in store', () => {
        act(() => {
            useAppStore.getState().setPermissions({'portal.design': true});
        });
        const {result} = renderHook(() => usePermission('portal.design'));
        expect(result.current).toBe(true);
        // cleanup
        act(() => {
            useAppStore.getState().setPermissions({});
        });
    });
});
