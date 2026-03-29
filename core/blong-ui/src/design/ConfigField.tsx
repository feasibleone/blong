/**
 * ConfigField — draggable field wrapper for design mode.
 *
 * Supports drag between cards, drag from "add field" palette,
 * and shows field name in design mode.
 */

import React from 'react';

import {useDesign} from '../hooks/useDesign.js';

/** Props for the ConfigField component. */
export interface ConfigFieldProps {
    /** The field name. */
    name: string;
    /** The display label. */
    label: string;
    /** The card ID this field belongs to. */
    cardId: string;
    /** The rendered field content. */
    children: React.ReactNode;
    /** Called when this field is removed from its card. */
    onRemove?: (fieldName: string, cardId: string) => void;
}

/**
 * ConfigField — wraps a field with design-mode controls.
 *
 * In design mode, fields become draggable and show their property name.
 */
export function ConfigField({
    name,
    label,
    cardId,
    children,
    onRemove,
}: ConfigFieldProps): React.ReactElement {
    const {isDesignMode, selectedId, setSelectedId} = useDesign();

    if (!isDesignMode) {
        return React.createElement(React.Fragment, null, children);
    }

    const isSelected = selectedId === `field:${name}`;

    return React.createElement(
        'div',
        {
            className: `blong-config-field ${isSelected ? 'blong-config-field-selected' : ''}`,
            draggable: true,
            onDragStart: (e: React.DragEvent) => {
                e.dataTransfer.setData('text/plain', `field:${cardId}:${name}`);
                e.dataTransfer.effectAllowed = 'move';
            },
            onClick: (e: React.MouseEvent) => {
                e.stopPropagation();
                setSelectedId(`field:${name}`);
            },
        },
        React.createElement(
            'div',
            {className: 'blong-config-field-header'},
            React.createElement('span', {className: 'blong-config-field-drag'}, '⋮'),
            React.createElement('span', {className: 'blong-config-field-name'}, name),
            React.createElement('span', {className: 'blong-config-field-label'}, label),
            onRemove &&
                React.createElement(
                    'button',
                    {
                        className: 'blong-config-field-remove',
                        onClick: (e: React.MouseEvent) => {
                            e.stopPropagation();
                            onRemove(name, cardId);
                        },
                    },
                    '✕',
                ),
        ),
        children,
    );
}
