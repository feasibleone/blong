/**
 * ConditionalCard — card with watch/match conditional visibility.
 *
 * Observes a form field value and shows/hides based on a match object.
 */

import React from 'react';
import {useFormContext, useWatch} from 'react-hook-form';

/** Props for the ConditionalCard component. */
export interface ConditionalCardProps {
    /** Form field to observe. */
    watch: string;
    /** Object to match against the watched field value. */
    match: Record<string, unknown>;
    /** The card content to render when visible. */
    children: React.ReactNode;
    /** CSS class name. */
    className?: string;
}

/**
 * Check if a watched value matches the match criteria.
 * Card is visible when the watched value matches any value in the match object.
 */
function matchesValue(watchedValue: unknown, match: Record<string, unknown>): boolean {
    return Object.values(match).includes(watchedValue);
}

/**
 * ConditionalCard — shows content only when the watched field matches.
 *
 * @example
 * ```tsx
 * <ConditionalCard watch="accountType" match={{value: 'business'}}>
 *     <BusinessFields />
 * </ConditionalCard>
 * ```
 */
export function ConditionalCard({
    watch: watchField,
    match,
    children,
    className = '',
}: ConditionalCardProps): React.ReactElement | null {
    const watchedValue = useWatch({name: watchField});

    if (!matchesValue(watchedValue, match)) {
        return null;
    }

    return React.createElement(
        'div',
        {className: `blong-conditional-card ${className}`},
        children,
    );
}
