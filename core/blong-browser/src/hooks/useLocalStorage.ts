/**
 * useLocalStorage — persistent state in localStorage.
 */
import {useCallback, useState} from 'react';

export function useLocalStorage<T>(
    key: string,
    initialValue: T,
): [T, (value: T | ((prev: T) => T)) => void] {
    const [storedValue, setStoredValue] = useState<T>(() => {
        try {
            const item = window.localStorage.getItem(key);
            return item ? (JSON.parse(item) as T) : initialValue;
        } catch {
            return initialValue;
        }
    });

    const setValue = useCallback(
        (value: T | ((prev: T) => T)) => {
            setStoredValue(prev => {
                const next = typeof value === 'function' ? (value as (prev: T) => T)(prev) : value;
                try {
                    window.localStorage.setItem(key, JSON.stringify(next));
                } catch {
                    // ignore write errors
                }
                return next;
            });
        },
        [key],
    );

    return [storedValue, setValue];
}
