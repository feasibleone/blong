import {act, renderHook} from '@testing-library/react';
import {beforeEach, describe, expect, it} from 'vitest';
import {useAppStore} from '../state/appStore.js';
import {useAuth} from './useAuth.js';

beforeEach(() => {
    // Reset auth state
    useAppStore.setState(s => ({
        ...s,
        auth: {token: null, userId: null, userName: null, permissions: []},
    }));
});

describe('useAuth', () => {
    it('returns null token/userId when not authenticated', () => {
        const {result} = renderHook(() => useAuth());
        expect(result.current.token).toBeNull();
        expect(result.current.userId).toBeNull();
    });

    it('setToken updates the auth token', () => {
        const {result} = renderHook(() => useAuth());
        act(() => {
            result.current.setToken('my-token');
        });
        expect(result.current.token).toBe('my-token');
    });

    it('logout clears the token', () => {
        const {result} = renderHook(() => useAuth());
        act(() => {
            result.current.setToken('some-token');
        });
        act(() => {
            result.current.logout();
        });
        expect(result.current.token).toBeNull();
    });

    it('exposes permissions array from the store', () => {
        useAppStore.setState(s => ({...s, auth: {...s.auth, permissions: ['admin', 'edit']}}));
        const {result} = renderHook(() => useAuth());
        expect(result.current.permissions).toContain('admin');
    });
});
