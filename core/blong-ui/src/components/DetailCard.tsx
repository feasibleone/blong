/**
 * DetailCard — read-only entity display card.
 */

import React from 'react';

import type {BlongSchema, Cards} from '../types.js';
import {DetailFactory} from '../factory/DetailFactory.js';

/** Props for the DetailCard component. */
export interface DetailCardProps {
    /** The schema defining the entity shape. */
    schema: BlongSchema;
    /** Entity data to display. */
    data: Record<string, unknown>;
    /** Card grouping definitions. */
    cards?: Cards;
    /** Title displayed in the card header. */
    title?: string;
    /** Whether data is loading. */
    isLoading?: boolean;
    /** CSS class for the container. */
    className?: string;
}

/**
 * DetailCard component — read-only entity display with toolbar.
 *
 * @example
 * ```tsx
 * <DetailCard
 *     schema={methodSchema.response}
 *     data={entity}
 *     cards={myCards}
 *     title="User Details"
 * />
 * ```
 */
export function DetailCard({
    schema,
    data,
    cards,
    title,
    isLoading = false,
    className = '',
}: DetailCardProps): React.ReactElement {
    return React.createElement(
        'div',
        {className: `blong-detail-card ${className}`},
        title &&
            React.createElement(
                'div',
                {className: 'blong-toolbar'},
                React.createElement('h3', {className: 'blong-toolbar-title'}, title),
            ),
        React.createElement(DetailFactory, {
            schema,
            data,
            cards,
            isLoading,
        }),
    );
}
