/**
 * SelectCard — dialog for adding a new card to the layout.
 *
 * Shows defined cards not yet in the active layout.
 */

import React, {useMemo, useState} from 'react';

import type {Cards, Layout} from '../types.js';

/** Props for the SelectCard component. */
export interface SelectCardProps {
    /** All available cards. */
    cards: Cards;
    /** The active layout. */
    layout: Layout;
    /** Called when a card is selected. */
    onSelect: (cardId: string) => void;
    /** Called when the dialog is closed. */
    onClose: () => void;
    /** Whether the dialog is visible. */
    visible: boolean;
}

/**
 * SelectCard dialog — pick a card to add to the layout.
 */
export function SelectCard({
    cards,
    layout,
    onSelect,
    onClose,
    visible,
}: SelectCardProps): React.ReactElement | null {
    const [filter, setFilter] = useState('');

    const availableCards = useMemo(() => {
        const usedCards = new Set(layout.cards);
        return Object.entries(cards)
            .filter(([id]) => !usedCards.has(id))
            .map(([id, card]) => ({
                id,
                label: card.label ?? id,
            }));
    }, [cards, layout]);

    const filtered = filter
        ? availableCards.filter(
              c =>
                  c.id.toLowerCase().includes(filter.toLowerCase()) ||
                  c.label.toLowerCase().includes(filter.toLowerCase()),
          )
        : availableCards;

    if (!visible) return null;

    return React.createElement(
        'div',
        {className: 'blong-dialog-overlay', onClick: onClose},
        React.createElement(
            'div',
            {
                className: 'blong-dialog blong-select-card-dialog',
                onClick: (e: React.MouseEvent) => e.stopPropagation(),
            },
            React.createElement('h4', null, 'Add Card'),
            React.createElement('input', {
                type: 'search',
                placeholder: 'Search cards...',
                value: filter,
                onChange: (e: React.ChangeEvent<HTMLInputElement>) => setFilter(e.target.value),
                className: 'blong-dialog-search',
                autoFocus: true,
            }),
            React.createElement(
                'ul',
                {className: 'blong-dialog-list'},
                ...filtered.map(c =>
                    React.createElement(
                        'li',
                        {
                            key: c.id,
                            className: 'blong-dialog-list-item',
                            onClick: () => {
                                onSelect(c.id);
                                onClose();
                            },
                        },
                        c.label,
                    ),
                ),
            ),
            filtered.length === 0 &&
                React.createElement('p', {className: 'blong-dialog-empty'}, 'No available cards'),
            React.createElement(
                'button',
                {className: 'blong-btn blong-btn-secondary', onClick: onClose},
                'Close',
            ),
        ),
    );
}
