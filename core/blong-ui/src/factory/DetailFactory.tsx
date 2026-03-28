/**
 * DetailFactory — generate a read-only detail view from a response schema.
 *
 * Renders entity properties in a label-value layout, respecting card
 * grouping and field ordering from schema extensions.
 */

import React, {useMemo} from 'react';

import type {BlongSchema, BlongSchemaProperty, Cards} from '../types.js';
import {resolveField} from './FieldResolver.js';
import type {ResolvedField} from './FieldResolver.js';

/** Props for the DetailFactory component. */
export interface DetailFactoryProps {
    /** The schema defining the entity shape. */
    schema: BlongSchema;
    /** Entity data to display. */
    data: Record<string, unknown>;
    /** Optional card grouping. */
    cards?: Cards;
    /** Whether data is loading. */
    isLoading?: boolean;
    /** CSS class for the container. */
    className?: string;
}

/**
 * Format a value for display in the detail view.
 */
function formatValue(value: unknown, field: ResolvedField): string {
    if (value == null) return '—';

    switch (field.widget) {
        case 'boolean':
            return value ? 'Yes' : 'No';
        case 'date':
            return value instanceof Date ? value.toLocaleDateString() : String(value);
        case 'datetime':
            return value instanceof Date ? value.toLocaleString() : String(value);
        case 'time':
            return value instanceof Date
                ? value.toLocaleTimeString()
                : String(value);
        case 'currency':
            if (typeof value === 'number') {
                return new Intl.NumberFormat(undefined, {
                    style: 'currency',
                    currency: field.currency ?? 'USD',
                }).format(value);
            }
            return String(value);
        case 'password':
            return '••••••••';
        default:
            if (Array.isArray(value)) return value.join(', ');
            if (typeof value === 'object') return JSON.stringify(value);
            return String(value);
    }
}

/**
 * DetailFactory component — generates a read-only detail view.
 *
 * @example
 * ```tsx
 * <DetailFactory
 *     schema={methodSchema.response}
 *     data={entity}
 *     cards={myCards}
 * />
 * ```
 */
export function DetailFactory({
    schema,
    data,
    cards,
    isLoading = false,
    className = '',
}: DetailFactoryProps): React.ReactElement {
    const requiredFields = schema.required as string[] | undefined;

    const fields = useMemo(() => {
        if (!schema.properties) return [];

        const resolved: ResolvedField[] = [];
        for (const [name, prop] of Object.entries(schema.properties)) {
            resolved.push(resolveField(name, prop as BlongSchemaProperty, requiredFields));
        }
        return resolved.filter(f => !f.hidden).sort((a, b) => a.order - b.order);
    }, [schema, requiredFields]);

    if (isLoading) {
        return React.createElement(
            'div',
            {className: `blong-detail blong-detail-loading ${className}`},
            ...Array.from({length: 4}, (_, i) =>
                React.createElement('div', {
                    key: i,
                    className: 'blong-skeleton blong-skeleton-row',
                }),
            ),
        );
    }

    // Group fields by card if cards provided
    if (cards && Object.keys(cards).length > 0) {
        const cardElements = Object.entries(cards).map(([cardId, card]) => {
            const cardFields = card.widgets
                .flat()
                .map(name => fields.find(f => f.name === name))
                .filter((f): f is ResolvedField => f != null);

            if (cardFields.length === 0) return null;

            return React.createElement(
                'fieldset',
                {key: cardId, className: `blong-detail-card blong-detail-card-${cardId}`},
                card.label && React.createElement('legend', null, card.label),
                React.createElement(
                    'dl',
                    {className: 'blong-detail-list'},
                    ...cardFields.flatMap(field => [
                        React.createElement('dt', {key: `dt-${field.name}`}, field.label),
                        React.createElement(
                            'dd',
                            {key: `dd-${field.name}`},
                            formatValue(data[field.name], field),
                        ),
                    ]),
                ),
            );
        });

        return React.createElement(
            'div',
            {className: `blong-detail ${className}`},
            ...cardElements.filter(Boolean),
        );
    }

    // Flat list of all fields
    return React.createElement(
        'div',
        {className: `blong-detail ${className}`},
        React.createElement(
            'dl',
            {className: 'blong-detail-list'},
            ...fields.flatMap(field => [
                React.createElement('dt', {key: `dt-${field.name}`}, field.label),
                React.createElement(
                    'dd',
                    {key: `dd-${field.name}`},
                    formatValue(data[field.name], field),
                ),
            ]),
        ),
    );
}
