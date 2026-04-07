import {act, renderHook} from '@testing-library/react';
import {beforeEach, describe, expect, it} from 'vitest';
import {useAppStore} from '../state/appStore.js';
import {useDarkMode} from './useDarkMode.js';
import {useText} from './useText.js';

describe('useDarkMode', () => {
    beforeEach(() => {
        localStorage.removeItem('blong-browser-dark-mode');
    });
    it('starts as false (light mode)', () => {
        const {result} = renderHook(() => useDarkMode());
        expect(result.current.isDark).toBe(false);
    });

    it('toggle switches dark mode on', () => {
        const {result} = renderHook(() => useDarkMode());
        act(() => result.current.toggle());
        expect(result.current.isDark).toBe(true);
    });

    it('toggle twice returns to light mode', () => {
        const {result} = renderHook(() => useDarkMode());
        act(() => result.current.toggle());
        act(() => result.current.toggle());
        expect(result.current.isDark).toBe(false);
    });

    it('setDark(true) enables dark mode', () => {
        const {result} = renderHook(() => useDarkMode());
        act(() => result.current.setDark(true));
        expect(result.current.isDark).toBe(true);
    });

    it('setDark(false) disables dark mode', () => {
        const {result} = renderHook(() => useDarkMode());
        act(() => result.current.setDark(true));
        act(() => result.current.setDark(false));
        expect(result.current.isDark).toBe(false);
    });
});

describe('useText', () => {
    beforeEach(() => {
        useAppStore.setState(s => ({...s, translations: {}}));
    });

    it('returns the key when no translation exists', () => {
        const {result} = renderHook(() => useText('hello.world'));
        expect(result.current).toBe('hello.world');
    });

    it('returns translated text when translation exists', () => {
        useAppStore.setState(s => ({
            ...s,
            translations: {'greet.button': 'Hello!'},
        }));
        const {result} = renderHook(() => useText('greet.button'));
        expect(result.current).toBe('Hello!');
    });

    it('interpolates params into the translated string', () => {
        useAppStore.setState(s => ({
            ...s,
            translations: {greeting: 'Hello, {name}! You have {count} messages.'},
        }));
        const {result} = renderHook(() => useText('greeting', {name: 'Alice', count: 5}));
        expect(result.current).toBe('Hello, Alice! You have 5 messages.');
    });

    it('returns key with params interpolated when no translation (uses key as template)', () => {
        const {result} = renderHook(() => useText('field.{name}.label', {name: 'email'}));
        expect(result.current).toBe('field.email.label');
    });
});
