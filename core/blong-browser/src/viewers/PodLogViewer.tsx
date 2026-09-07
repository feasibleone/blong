import React, {useEffect, useState} from 'react';
import type {ICommanderViewerProps} from './registry.js';

/**
 * PodLogViewer — monospace container-log leaf viewer.
 * Base for Kubernetes pod logs. Expects the fetcher to resolve
 * `{logs: string}` (see the `{ns}.pod.log` adapter operation).
 */
export function PodLogViewer({fetch, data, className}: ICommanderViewerProps) {
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

    const logs =
        data !== undefined
            ? typeof data === 'string'
                ? data
                : JSON.stringify(data, null, 2)
            : (() => {
                  const r = fetched as {logs?: string} | undefined;
                  if (!r) return '';
                  return typeof r.logs === 'string' ? r.logs : JSON.stringify(r, null, 2);
              })();

    return (
        <pre
            className={`blong-viewer blong-viewer-log ${className ?? ''}`}
            style={{
                margin: 0,
                padding: '0.5rem',
                overflow: 'auto',
                fontFamily: 'monospace',
                fontSize: '0.8rem',
                lineHeight: 1.35,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
                background: 'var(--surface-overlay)',
                borderRadius: 'var(--border-radius)',
            }}
        >
            {logs || 'No logs.'}
        </pre>
    );
}
