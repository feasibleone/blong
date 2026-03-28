/**
 * Performance utilities — lazy loading, virtualised helpers, skeleton screens.
 */

import React, {Suspense, useMemo} from 'react';

/** Props for LazyPage. */
export interface LazyPageProps {
    /** Dynamic import function returning the component module. */
    importFn: () => Promise<{default: React.ComponentType}>;
    /** Fallback to show while loading. */
    fallback?: React.ReactNode;
    /** Props to pass to the loaded component. */
    componentProps?: Record<string, unknown>;
}

/**
 * LazyPage — lazy-loads a page component with Suspense.
 *
 * @example
 * ```tsx
 * <LazyPage importFn={() => import('./pages/UserList.js')} />
 * ```
 */
export function LazyPage({
    importFn,
    fallback,
    componentProps = {},
}: LazyPageProps): React.ReactElement {
    const LazyComponent = useMemo(() => React.lazy(importFn), [importFn]);

    const loading = fallback ?? React.createElement(PageSkeleton);

    return React.createElement(
        Suspense,
        {fallback: loading},
        React.createElement(LazyComponent, componentProps),
    );
}

/** Props for SkeletonField. */
export interface SkeletonFieldProps {
    /** Width of the skeleton (CSS value, default: '100%'). */
    width?: string;
    /** Height of the skeleton (CSS value, default: '2rem'). */
    height?: string;
    /** CSS class name. */
    className?: string;
}

/**
 * SkeletonField — a placeholder rectangle for loading states.
 */
export function SkeletonField({
    width = '100%',
    height = '2rem',
    className = '',
}: SkeletonFieldProps): React.ReactElement {
    return React.createElement('div', {
        className: `blong-skeleton blong-skeleton-field ${className}`,
        style: {width, height},
        'aria-hidden': 'true',
    });
}

/**
 * SkeletonCard — a card-shaped placeholder for loading states.
 */
export function SkeletonCard({
    fields = 4,
    className = '',
}: {
    fields?: number;
    className?: string;
}): React.ReactElement {
    return React.createElement(
        'div',
        {className: `blong-skeleton blong-skeleton-card ${className}`, 'aria-hidden': 'true'},
        React.createElement(SkeletonField, {width: '60%', height: '1.5rem'}),
        ...Array.from({length: fields}, (_, i) =>
            React.createElement(SkeletonField, {key: i, height: '2.5rem'}),
        ),
    );
}

/**
 * SkeletonTable — a table-shaped placeholder for loading states.
 */
export function SkeletonTable({
    rows = 5,
    columns = 4,
    className = '',
}: {
    rows?: number;
    columns?: number;
    className?: string;
}): React.ReactElement {
    return React.createElement(
        'div',
        {className: `blong-skeleton blong-skeleton-table ${className}`, 'aria-hidden': 'true'},
        // Header row
        React.createElement(
            'div',
            {className: 'blong-skeleton-row blong-skeleton-header'},
            ...Array.from({length: columns}, (_, i) =>
                React.createElement(SkeletonField, {key: i, height: '2rem'}),
            ),
        ),
        // Data rows
        ...Array.from({length: rows}, (_, ri) =>
            React.createElement(
                'div',
                {key: ri, className: 'blong-skeleton-row'},
                ...Array.from({length: columns}, (_, ci) =>
                    React.createElement(SkeletonField, {key: ci, height: '2rem'}),
                ),
            ),
        ),
    );
}

/**
 * PageSkeleton — a full page skeleton combining card and table placeholders.
 */
export function PageSkeleton(): React.ReactElement {
    return React.createElement(
        'div',
        {className: 'blong-page-skeleton', 'aria-label': 'Loading'},
        React.createElement(SkeletonCard),
        React.createElement(SkeletonTable),
    );
}
