/**
 * PolymorphicLayout — typeField property selects layout by data type value.
 *
 * Looks up `edit{TypeValue}`/`create{TypeValue}` layout from the layouts map.
 */

import React, {useMemo} from 'react';
import type {FieldValues} from 'react-hook-form';
import {useForm, useWatch} from 'react-hook-form';

import {FormFactory} from '../factory/FormFactory.js';
import {resolveLayout} from '../hooks/useLayout.js';
import type {BlongSchema, Cards, FormMode, Layouts} from '../types.js';

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
    // Create a form instance so useWatch has access to control without requiring
    // an ancestor FormProvider. FormFactory renders its own FormProvider internally
    // for the editable form; this form tracks the typeField for layout selection.
    const watchForm = useForm<FieldValues>({
        defaultValues: defaultValues as FieldValues,
    });
    const typeValue = useWatch({
        name: typeField,
        defaultValue: defaultValues?.[typeField],
        control: watchForm.control,
    });
    const typeValueStr = typeValue != null ? String(typeValue) : undefined;

    const activeLayout = useMemo(
        () => resolveLayout(layouts, mode, typeValueStr),
        [layouts, mode, typeValueStr],
    );

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
