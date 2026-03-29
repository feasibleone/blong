/**
 * ConfigCard — draggable card wrapper for design mode.
 *
 * Supports drag source (card), drop target (card slot), and
 * shows add/remove indicators in design mode.
 */

import React from 'react';

import type {Card} from '../types.js';
import {useDesign} from '../hooks/useDesign.js';

/** Props for the ConfigCard component. */
export interface ConfigCardProps {
    /** The card definition. */
    card: Card;
    /** The rendered card content. */
    children: React.ReactNode;
    /** Called when this card is dropped to a new position. */
    onDrop?: (cardId: string, targetIndex: number) => void;
    /** Called when this card is removed. */
    onRemove?: (cardId: string) => void;
}

/**
 * ConfigCard — wraps a card with design-mode controls.
 *
 * In design mode, cards become draggable and show selection indicators.
 * Clicking selects the card for property inspection.
 */
export function ConfigCard({
    card,
    children,
    onRemove,
}: ConfigCardProps): React.ReactElement {
    const {isDesignMode, selectedId, setSelectedId} = useDesign();

    if (!isDesignMode) {
        return React.createElement(React.Fragment, null, children);
    }

    const isSelected = selectedId === `card:${card.id}`;

    return React.createElement(
        'div',
        {
            className: `blong-config-card ${isSelected ? 'blong-config-card-selected' : ''}`,
            draggable: true,
            onDragStart: (e: React.DragEvent) => {
                e.dataTransfer.setData('text/plain', `card:${card.id}`);
                e.dataTransfer.effectAllowed = 'move';
            },
            onClick: (e: React.MouseEvent) => {
                e.stopPropagation();
                setSelectedId(`card:${card.id}`);
            },
        },
        React.createElement(
            'div',
            {className: 'blong-config-card-header'},
            React.createElement('span', {className: 'blong-config-card-drag'}, '⋮⋮'),
            React.createElement('span', {className: 'blong-config-card-label'}, card.label ?? card.id),
            onRemove &&
                React.createElement(
                    'button',
                    {
                        className: 'blong-config-card-remove',
                        onClick: (e: React.MouseEvent) => {
                            e.stopPropagation();
                            onRemove(card.id);
                        },
                    },
                    '✕',
                ),
        ),
        children,
    );
}
