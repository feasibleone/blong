/**
 * CustomWidgetRenderer — escape hatch for custom React components as widgets.
 *
 * Custom widgets receive `Input`, `Label`, `ErrorLabel` internal components
 * as props. Each widget declares the properties it manages via `.properties`.
 */

import React from 'react';
import {useFormContext} from 'react-hook-form';

import type {CustomWidget, CustomWidgets, WidgetInternals} from '../types.js';

/** Props for the CustomWidgetRenderer component. */
export interface CustomWidgetRendererProps {
    /** Name of the custom widget to render. */
    widgetName: string;
    /** Map of registered custom widgets. */
    editors: CustomWidgets;
    /** Field name in the form. */
    fieldName: string;
    /** Additional props to pass to the widget. */
    extraProps?: Record<string, unknown>;
}

/**
 * Internal Input component passed to custom widgets.
 */
function WidgetInput({name, ...props}: {name: string; [key: string]: unknown}): React.ReactElement {
    const {register} = useFormContext();
    return React.createElement('input', {...register(name), ...props, id: name});
}

/**
 * Internal Label component passed to custom widgets.
 */
function WidgetLabel({
    htmlFor,
    children,
}: {
    htmlFor: string;
    children: React.ReactNode;
}): React.ReactElement {
    return React.createElement('label', {htmlFor}, children);
}

/**
 * Internal ErrorLabel component passed to custom widgets.
 */
function WidgetErrorLabel({name}: {name: string}): React.ReactElement {
    const {
        formState: {errors},
    } = useFormContext();
    const error = errors[name];
    if (!error) return React.createElement(React.Fragment);
    return React.createElement(
        'small',
        {className: 'blong-field-error'},
        String((error as {message?: string}).message ?? 'Invalid'),
    );
}

const widgetInternals: WidgetInternals = {
    Input: WidgetInput,
    Label: WidgetLabel,
    ErrorLabel: WidgetErrorLabel,
};

/**
 * CustomWidgetRenderer — renders a registered custom widget.
 *
 * @example
 * ```tsx
 * <CustomWidgetRenderer
 *     widgetName="addressPicker"
 *     editors={myEditors}
 *     fieldName="address"
 * />
 * ```
 */
export function CustomWidgetRenderer({
    widgetName,
    editors,
    fieldName,
    extraProps = {},
}: CustomWidgetRendererProps): React.ReactElement {
    const widget = editors[widgetName];

    if (!widget) {
        return React.createElement(
            'div',
            {className: 'blong-widget-error'},
            `Unknown custom widget: ${widgetName}`,
        );
    }

    return React.createElement(widget.component, {
        ...widgetInternals,
        ...extraProps,
        name: fieldName,
    });
}

/**
 * Check if a widget name refers to a registered custom widget.
 */
export function isCustomWidget(
    widgetName: string,
    editors?: CustomWidgets,
): boolean {
    return editors != null && widgetName in editors;
}
