/**
 * WidgetMap — mapping from JSON Schema type/format to PrimeReact components.
 *
 * Three widget categories:
 * - Scalar: renders a single primitive value
 * - Scalar array: selects one or more values from a list
 * - Vector array: editable table with per-column widgets
 */

import type {BlongSchemaProperty, BlongWidgetType, WidgetDescriptor} from '../types.js';

// ── Type → Widget mapping tables ──────────────────────────────────────────────

/**
 * Default mapping from JSON Schema `type` + `format` to scalar widget type.
 */
const TYPE_FORMAT_MAP: Record<string, BlongWidgetType> = {
    'string:': 'input',
    'string:password': 'password',
    'string:date': 'date',
    'string:time': 'time',
    'string:date-time': 'datetime',
    'string:email': 'input',
    'string:uri': 'input',
    'string:uuid': 'input',
    'string:binary': 'file',
    'number:': 'number',
    'number:float': 'number',
    'number:double': 'number',
    'number:currency': 'currency',
    'integer:': 'integer',
    'integer:int32': 'integer',
    'integer:int64': 'integer',
    'boolean:': 'boolean',
};

/**
 * Resolve the widget type for a schema property.
 *
 * Priority:
 * 1. Explicit `x-blong-widget` override
 * 2. `enum` constraint → dropdown
 * 3. `type` + `format` lookup
 * 4. Fallback to 'input'
 */
export function resolveWidgetType(property: BlongSchemaProperty): BlongWidgetType {
    // Explicit override
    if (property['x-blong-widget']) {
        return property['x-blong-widget'];
    }

    // Enum → dropdown
    if (property.enum) {
        return 'dropdown';
    }

    // Type + format lookup
    const type = (typeof property.type === 'string' ? property.type : '') ?? '';
    const format = property.format ?? '';
    const key = `${type}:${format}`;
    const mapped = TYPE_FORMAT_MAP[key];
    if (mapped) return mapped;

    // Multi-line string → text area
    if (type === 'string' && property.maxLength && property.maxLength > 255) {
        return 'text';
    }

    // Array types
    if (type === 'array') {
        const items = property.items;
        if (items && typeof items === 'object' && !Array.isArray(items)) {
            if ('type' in items && items.type === 'object') {
                return 'table'; // Vector array
            }
            if ('enum' in items) {
                return 'multiSelect';
            }
        }
        return 'multiSelect';
    }

    return 'input';
}

/**
 * Build a full widget descriptor from a schema property.
 */
export function resolveWidgetDescriptor(property: BlongSchemaProperty): WidgetDescriptor {
    const widgetType = resolveWidgetType(property);

    // Scalar array widgets
    const scalarArrayTypes = new Set<BlongWidgetType>([
        'multiSelect',
        'multiSelectTree',
        'selectTable',
        'multiSelectPanel',
        'multiSelectTreeTable',
    ]);
    if (scalarArrayTypes.has(widgetType)) {
        return {
            category: 'scalarArray',
            type: widgetType as WidgetDescriptor & {category: 'scalarArray'} extends never
                ? never
                : 'multiSelect' | 'multiSelectTree' | 'selectTable' | 'multiSelectPanel' | 'multiSelectTreeTable',
        };
    }

    // Vector array widget
    if (widgetType === 'table') {
        const items = property.items;
        const columns: {field: string; header: string; widget: WidgetDescriptor}[] = [];

        if (items && typeof items === 'object' && 'properties' in items) {
            const props = (items as {properties: Record<string, BlongSchemaProperty>}).properties;
            for (const [field, prop] of Object.entries(props)) {
                columns.push({
                    field,
                    header: prop.title ?? field,
                    widget: resolveWidgetDescriptor(prop),
                });
            }
        }

        return {
            category: 'vectorArray',
            type: 'table',
            columns,
        };
    }

    // Scalar widget (default)
    return {
        category: 'scalar',
        type: widgetType as WidgetDescriptor & {category: 'scalar'} extends never
            ? never
            : 'input' | 'password' | 'text' | 'mask' | 'number' | 'currency' | 'integer' | 'boolean' | 'date' | 'time' | 'datetime' | 'dropdown' | 'dropdownTree' | 'select',
    };
}

/**
 * Get the PrimeReact component name for a widget type.
 */
export function getPrimeComponent(widgetType: BlongWidgetType): string {
    const componentMap: Record<BlongWidgetType, string> = {
        input: 'InputText',
        password: 'Password',
        text: 'InputTextarea',
        mask: 'InputMask',
        number: 'InputNumber',
        currency: 'InputNumber',
        integer: 'InputNumber',
        boolean: 'Checkbox',
        date: 'Calendar',
        time: 'Calendar',
        datetime: 'Calendar',
        dropdown: 'Dropdown',
        dropdownTree: 'TreeSelect',
        select: 'SelectButton',
        multiSelect: 'MultiSelect',
        multiSelectTree: 'TreeSelect',
        selectTable: 'DataTable',
        multiSelectPanel: 'ListBox',
        multiSelectTreeTable: 'TreeTable',
        table: 'DataTable',
        file: 'FileUpload',
    };
    return componentMap[widgetType];
}
