/**
 * Widget registry — central map of widget type → React component.
 * Can be extended per suite using registry.register().
 */
import type React from 'react';
import type { IWidgetProps, IWidgetRegistry, WidgetType } from '../types/widget.js';
import { BooleanWidget } from './BooleanWidget.js';
import { CurrencyWidget } from './CurrencyWidget.js';
import { DateTimeWidget } from './DateTimeWidget.js';
import { DateWidget } from './DateWidget.js';
import { DropdownWidget } from './DropdownWidget.js';
import { FileWidget } from './FileWidget.js';
import { ImageWidget } from './ImageWidget.js';
import { IntegerWidget } from './IntegerWidget.js';
import { JsonWidget } from './JsonWidget.js';
import { MaskWidget } from './MaskWidget.js';
import { MultiSelectWidget } from './MultiSelectWidget.js';
import { NumberWidget } from './NumberWidget.js';
import { PasswordWidget } from './PasswordWidget.js';
import { SelectWidget } from './SelectWidget.js';
import { TableWidget } from './TableWidget.js';
import { TextWidget } from './TextWidget.js';
import { TextareaWidget } from './TextareaWidget.js';
import { TimeWidget } from './TimeWidget.js';

class WidgetRegistryImpl implements IWidgetRegistry {
    private map = new Map<string, React.ComponentType<IWidgetProps>>();

    register(type: string, component: React.ComponentType<IWidgetProps>): void {
        this.map.set(type, component);
    }

    get(type: string): React.ComponentType<IWidgetProps> | undefined {
        return this.map.get(type);
    }

    list(): string[] {
        return [...this.map.keys()];
    }
}

/** Global singleton widget registry */
export const widgetRegistry = new WidgetRegistryImpl();

const builtins: Array<[WidgetType, React.ComponentType<IWidgetProps>]> = [
    ['input', TextWidget as React.ComponentType<IWidgetProps>],
    ['text', TextareaWidget as React.ComponentType<IWidgetProps>],
    ['textArea', TextareaWidget as React.ComponentType<IWidgetProps>],
    ['number', NumberWidget as React.ComponentType<IWidgetProps>],
    ['currency', CurrencyWidget as React.ComponentType<IWidgetProps>],
    ['percent', NumberWidget as React.ComponentType<IWidgetProps>],
    ['integer', IntegerWidget as React.ComponentType<IWidgetProps>],
    ['boolean', BooleanWidget as React.ComponentType<IWidgetProps>],
    ['checkbox', BooleanWidget as React.ComponentType<IWidgetProps>],
    ['date', DateWidget as React.ComponentType<IWidgetProps>],
    ['time', TimeWidget as React.ComponentType<IWidgetProps>],
    ['dateTime', DateTimeWidget as React.ComponentType<IWidgetProps>],
    ['password', PasswordWidget as React.ComponentType<IWidgetProps>],
    ['mask', MaskWidget as React.ComponentType<IWidgetProps>],
    ['dropdown', DropdownWidget as React.ComponentType<IWidgetProps>],
    ['multiSelect', MultiSelectWidget as React.ComponentType<IWidgetProps>],
    ['select', SelectWidget as React.ComponentType<IWidgetProps>],
    ['table', TableWidget as React.ComponentType<IWidgetProps>],
    ['json', JsonWidget as React.ComponentType<IWidgetProps>],
    ['file', FileWidget as React.ComponentType<IWidgetProps>],
    ['image', ImageWidget as React.ComponentType<IWidgetProps>],
];

/** Register all built-in widgets synchronously */
export function registerBuiltinWidgets(): void {
    for (const [type, component] of builtins) {
        widgetRegistry.register(type, component);
    }
}

// Auto-register on module load so widgets are always available
registerBuiltinWidgets();

