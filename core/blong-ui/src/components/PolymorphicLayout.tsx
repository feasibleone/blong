/**
 * PolymorphicLayout — typeField property selects layout by data type value.
 *
 * Looks up `edit{TypeValue}`/`create{TypeValue}` layout from the layouts map.
 */

import React from 'react';
import {useWatch} from 'react-hook-form';

import type {BlongSchema, Cards, FormMode, Layouts} from '../types.js';
import {FormFactory} from '../factory/FormFactory.js';
import {resolveLayout} from '../hooks/useLayout.js';

/** Props for the PolymorphicLayout component. */
export interface PolymorphicLayoutProps {
    /** The form schema. */
    schema: BlongSchema;
    /** Card definitions. */
    cards: Cards;
    /** All available layouts. */
    layouts: Layouts;
    /** Current form mode. */
    mode: FormMode;
    /** The field name whose value determines the layout. */
    typeField: string;
    /** Default values for the form. */
    defaultValues?: Record<string, unknown>;
    /** Called when the form is submitted. */
    onSubmit: (data: Record<string, unknown>, mode: FormMode) => Promise<void>;
    /** Trigger callback for toolbar Save. */
    onTrigger?: (submitFn: (() => Promise<void>) | undefined) => void;
    /** CSS class name. */
    className?: string;
}

/**
 * PolymorphicLayout — switches layout based on a type field value.
 *
 * @example
 * ```tsx
 * <PolymorphicLayout
 *     schema={schema}
 *     cards={cards}
 *     layouts={{
 *         editDefault: defaultLayout,
 *         editTransfer: transferLayout,
 *         editPayment: paymentLayout,
 *     }}
 *     mode="edit"
 *     typeField="transactionType"
 *     onSubmit={handleSave}
 * />
 * ```
 */
export function PolymorphicLayout({
    schema,
    cards,
    layouts,
    mode,
    typeField,
    defaultValues,
    onSubmit,
    onTrigger,
    className = '',
}: PolymorphicLayoutProps): React.ReactElement {
    const typeValue = useWatch({name: typeField, defaultValue: defaultValues?.[typeField]});
    const typeValueStr = typeValue != null ? String(typeValue) : undefined;

    const activeLayout = resolveLayout(layouts, mode, typeValueStr);

    if (!activeLayout) {
        return React.createElement(
            'div',
            {className: 'blong-polymorphic-error'},
            `No layout found for type "${typeValueStr}" in mode "${mode}"`,
        );
    }

    return React.createElement(FormFactory, {
        schema,
        cards,
        layout: activeLayout,
        mode,
        defaultValues,
        onSubmit,
        onTrigger,
        className: `blong-polymorphic-layout ${className}`,
    });
}
