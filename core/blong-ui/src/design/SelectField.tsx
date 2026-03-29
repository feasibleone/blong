/**
 * SelectField — dialog for adding a new field to a card from the schema.
 *
 * Shows schema properties not yet assigned to any card.
 */

import React, {useMemo, useState} from 'react';

import type {BlongSchema, BlongSchemaProperty, Cards} from '../types.js';
import {getCardFieldNames} from '../factory/CardResolver.js';

/** Props for the SelectField component. */
export interface SelectFieldProps {
    /** The full schema. */
    schema: BlongSchema;
    /** Current cards configuration. */
    cards: Cards;
    /** Called when a field is selected. */
    onSelect: (fieldName: string) => void;
    /** Called when the dialog is closed. */
    onClose: () => void;
    /** Whether the dialog is visible. */
    visible: boolean;
}

/**
 * SelectField dialog — pick a schema property to add to a card.
 */
export function SelectField({
    schema,
    cards,
    onSelect,
    onClose,
    visible,
}: SelectFieldProps): React.ReactElement | null {
    const [filter, setFilter] = useState('');

    const availableFields = useMemo(() => {
        if (!schema.properties) return [];
        const usedFields = getCardFieldNames(cards);
        return Object.entries(schema.properties)
            .filter(([name]) => !usedFields.has(name))
            .map(([name, prop]) => ({
                name,
                label: (prop as BlongSchemaProperty).title ?? name,
            }));
    }, [schema, cards]);

    const filtered = filter
        ? availableFields.filter(
              f =>
                  f.name.toLowerCase().includes(filter.toLowerCase()) ||
                  f.label.toLowerCase().includes(filter.toLowerCase()),
          )
        : availableFields;

    if (!visible) return null;

    return React.createElement(
        'div',
        {className: 'blong-dialog-overlay', onClick: onClose},
        React.createElement(
            'div',
            {
                className: 'blong-dialog blong-select-field-dialog',
                onClick: (e: React.MouseEvent) => e.stopPropagation(),
            },
            React.createElement('h4', null, 'Add Field'),
            React.createElement('input', {
                type: 'search',
                placeholder: 'Search fields...',
                value: filter,
                onChange: (e: React.ChangeEvent<HTMLInputElement>) => setFilter(e.target.value),
                className: 'blong-dialog-search',
                autoFocus: true,
            }),
            React.createElement(
                'ul',
                {className: 'blong-dialog-list'},
                ...filtered.map(f =>
                    React.createElement(
                        'li',
                        {
                            key: f.name,
                            className: 'blong-dialog-list-item',
                            onClick: () => {
                                onSelect(f.name);
                                onClose();
                            },
                        },
                        React.createElement('strong', null, f.name),
                        ' — ',
                        f.label,
                    ),
                ),
            ),
            filtered.length === 0 &&
                React.createElement('p', {className: 'blong-dialog-empty'}, 'No available fields'),
            React.createElement(
                'button',
                {className: 'blong-btn blong-btn-secondary', onClick: onClose},
                'Close',
            ),
        ),
    );
}
