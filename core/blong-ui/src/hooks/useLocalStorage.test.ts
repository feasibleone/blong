import {act, renderHook} from '@testing-library/react';
import {describe, expect, it} from 'vitest';
import {useLocalStorage} from './useLocalStorage.js';

describe('useLocalStorage', () => {
    it('returns initial value on first use', () => {
        const {result} = renderHook(() => useLocalStorage('test-key-01', 42));
        expect(result.current[0]).toBe(42);
    });

    it('persists value to localStorage', () => {
        const {result} = renderHook(() => useLocalStorage('test-key-02', 'hello'));
        act(() => {
            result.current[1]('world');
        });
        expect(result.current[0]).toBe('world');
        expect(window.localStorage.getItem('test-key-02')).toBe('"world"');
    });

    it('reads existing value from localStorage', () => {
        window.localStorage.setItem('test-key-03', JSON.stringify({x: 1}));
        const {result} = renderHook(() => useLocalStorage('test-key-03', {x: 0}));
        expect(result.current[0]).toEqual({x: 1});
    });

    it('supports functional updater', () => {
        const {result} = renderHook(() => useLocalStorage('test-key-04', 0));
        act(() => {
            result.current[1](prev => prev + 1);
        });
        expect(result.current[0]).toBe(1);
    });
});
