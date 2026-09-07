import {useEffect, useState} from 'react';

/** Humanize a camelCase / snake_case field name for display. */
export function humanize(key: string): string {
    return key
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .replace(/[_-]+/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * Resolve a viewer's content: prefer the `data` prop, else the `fetch` result,
 * else the leaf `node` itself. `fetch` is called once and its result cached.
 */
export function useViewerContent(
    node: Record<string, unknown>,
    fetch: ((params?: Record<string, unknown>) => Promise<unknown>) | undefined,
    data: unknown,
): unknown {
    const [fetched, setFetched] = useState<unknown>(undefined);
    useEffect(() => {
        if (!fetch || data !== undefined) return;
        let cancelled = false;
        void fetch().then(result => {
            if (!cancelled) setFetched(result);
        });
        return () => {
            cancelled = true;
        };
    }, [data, fetch]);
    return data !== undefined ? data : (fetched ?? node);
}

export const viewerRowStyle = {
    display: 'flex',
    gap: '0.5rem',
    padding: '0.25rem 0',
    borderBottom: '1px solid var(--surface-border)',
} as const;

export const viewerLabelStyle = {
    fontWeight: 600,
    minWidth: '10rem',
    color: 'var(--text-color-secondary)',
} as const;

export const viewerValueStyle = {wordBreak: 'break-all'} as const;
