/**
 * Inspector — property inspector panel for the selected field or card.
 *
 * Edit field properties (title, widget type, validation rules, hidden).
 * Edit card properties (label, className, permission).
 */

import React, {useCallback} from 'react';
import {useForm} from 'react-hook-form';
import type {FieldValues} from 'react-hook-form';

import {useDesign} from '../hooks/useDesign.js';
import type {BlongWidgetType} from '../types.js';

const WIDGET_OPTIONS: BlongWidgetType[] = [
    'input', 'password', 'text', 'mask', 'number', 'currency', 'integer',
    'boolean', 'date', 'time', 'datetime', 'dropdown', 'dropdownTree',
    'select', 'multiSelect', 'multiSelectTree', 'selectTable',
    'multiSelectPanel', 'multiSelectTreeTable', 'table', 'file',
];

/** Props for the Inspector component. */
export interface InspectorProps {
    /** Current property values for the selected element. */
    properties?: Record<string, unknown>;
    /** Called when a property is changed. */
    onChange?: (updates: Record<string, unknown>) => void;
    /** CSS class for the container. */
    className?: string;
}

/**
 * Inspector component — property editor for the selected design element.
 *
 * @example
 * ```tsx
 * <Inspector
 *     properties={selectedFieldProps}
 *     onChange={handlePropertyChange}
 * />
 * ```
 */
export function Inspector({
    properties = {},
    onChange,
    className = '',
}: InspectorProps): React.ReactElement {
    const {selectedId} = useDesign();
    const form = useForm<FieldValues>({defaultValues: properties as FieldValues});

    const handleChange = useCallback(
        (field: string, value: unknown) => {
            onChange?.({[field]: value});
        },
        [onChange],
    );

    if (!selectedId) {
        return React.createElement(
            'div',
            {className: `blong-inspector blong-inspector-empty ${className}`},
            React.createElement('p', null, 'Select a field or card to inspect its properties'),
        );
    }

    const isField = selectedId.startsWith('field:');
    const isCard = selectedId.startsWith('card:');

    if (isField) {
        return React.createElement(
            'div',
            {className: `blong-inspector ${className}`},
            React.createElement('h4', null, 'Field Properties'),
            React.createElement(
                'div',
                {className: 'blong-inspector-field'},
                React.createElement('label', null, 'Title'),
                React.createElement('input', {
                    type: 'text',
                    value: String(properties.title ?? ''),
                    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
                        handleChange('title', e.target.value),
                }),
            ),
            React.createElement(
                'div',
                {className: 'blong-inspector-field'},
                React.createElement('label', null, 'Widget Type'),
                React.createElement(
                    'select',
                    {
                        value: String(properties['x-blong-widget'] ?? ''),
                        onChange: (e: React.ChangeEvent<HTMLSelectElement>) =>
                            handleChange('x-blong-widget', e.target.value || undefined),
                    },
                    React.createElement('option', {value: ''}, 'Auto-detect'),
                    ...WIDGET_OPTIONS.map(w =>
                        React.createElement('option', {key: w, value: w}, w),
                    ),
                ),
            ),
            React.createElement(
                'div',
                {className: 'blong-inspector-field'},
                React.createElement('label', null, 'Hidden'),
                React.createElement('input', {
                    type: 'checkbox',
                    checked: Boolean(properties['x-blong-hidden']),
                    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
                        handleChange('x-blong-hidden', e.target.checked),
                }),
            ),
            React.createElement(
                'div',
                {className: 'blong-inspector-field'},
                React.createElement('label', null, 'Order'),
                React.createElement('input', {
                    type: 'number',
                    value: String(properties['x-blong-order'] ?? ''),
                    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
                        handleChange('x-blong-order', e.target.value ? Number(e.target.value) : undefined),
                }),
            ),
            React.createElement(
                'div',
                {className: 'blong-inspector-field'},
                React.createElement('label', null, 'Read Only'),
                React.createElement('input', {
                    type: 'checkbox',
                    checked: Boolean(properties['x-blong-readonly']),
                    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
                        handleChange('x-blong-readonly', e.target.checked),
                }),
            ),
        );
    }

    if (isCard) {
        return React.createElement(
            'div',
            {className: `blong-inspector ${className}`},
            React.createElement('h4', null, 'Card Properties'),
            React.createElement(
                'div',
                {className: 'blong-inspector-field'},
                React.createElement('label', null, 'Label'),
                React.createElement('input', {
                    type: 'text',
                    value: String(properties.label ?? ''),
                    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
                        handleChange('label', e.target.value),
                }),
            ),
            React.createElement(
                'div',
                {className: 'blong-inspector-field'},
                React.createElement('label', null, 'CSS Class'),
                React.createElement('input', {
                    type: 'text',
                    value: String(properties.className ?? ''),
                    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
                        handleChange('className', e.target.value),
                }),
            ),
            React.createElement(
                'div',
                {className: 'blong-inspector-field'},
                React.createElement('label', null, 'Permission'),
                React.createElement('input', {
                    type: 'text',
                    value: String(properties.permission ?? ''),
                    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
                        handleChange('permission', e.target.value),
                }),
            ),
            React.createElement(
                'div',
                {className: 'blong-inspector-field'},
                React.createElement('label', null, 'Hidden'),
                React.createElement('input', {
                    type: 'checkbox',
                    checked: Boolean(properties.hidden),
                    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
                        handleChange('hidden', e.target.checked),
                }),
            ),
        );
    }

    return React.createElement(
        'div',
        {className: `blong-inspector ${className}`},
        React.createElement('p', null, 'Unknown selection type'),
    );
}
