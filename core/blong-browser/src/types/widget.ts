/**
 * Widget type definitions.
 * Widgets are the input components used inside Form cards.
 */
import type React from 'react';

/** All supported widget types */
export type WidgetType =
    | 'input'
    | 'mask'
    | 'text'
    | 'textArea'
    | 'password'
    | 'number'
    | 'integer'
    | 'currency'
    | 'percent'
    | 'boolean'
    | 'checkbox'
    | 'switch'
    | 'date'
    | 'time'
    | 'dateTime'
    | 'dateRange'
    | 'dropdown'
    | 'dropdownTree'
    | 'select'
    | 'selectTable'
    | 'multiSelect'
    | 'multiSelectTree'
    | 'multiSelectPanel'
    | 'multiSelectTreeTable'
    | 'chips'
    | 'file'
    | 'image'
    | 'table'
    | 'json'
    | 'code'
    | 'divider'
    | 'label'
    | 'link'
    | 'custom';

/** Base widget configuration (stored in schema x-widget) */
export interface IWidgetConfig {
    type: WidgetType;
    /** For dropdown/multiSelect — action name to fetch options */
    fetch?: string;
    /** Named dropdown key — loads options via portal.dropdown.list */
    dropdown?: string;
    /** Options list for static select/multiSelect/select */
    options?: Array<{value: unknown; label: string; icon?: string}>;
    /** Parent field name for cascaded dropdowns/tables (supports '$.selected.field' or just 'field') */
    parent?: string;
    /** Key mapping for cascaded table filtering: {ownKey: parentKey} */
    master?: Record<string, string>;
    /** Auto-select first filtered row when parent selection changes */
    autoSelect?: boolean;
    /** Copy-to-clipboard icon (input widget) */
    copy?: boolean;
    /** Mask pattern (mask widget) */
    mask?: string;
    /** Column definitions for table widget */
    columns?: string[] | Record<string, IFieldConfig>;
    /** Pivot config for static or dynamic pivots */
    pivot?: IPivotConfig;
    /** Field names to hide in table (used as implicit keys) */
    hidden?: string[];
    /** Selection mode for table widget */
    selectionMode?: 'single' | 'multiple';
    /** Label shown inside the widget (e.g. as table toolbar title instead of field label) */
    label?: string;
    /** Label field name in fetched options */
    labelField?: string;
    /** Value field name in fetched options */
    valueField?: string;
    /** Custom component type (for 'custom' type) */
    component?: React.ComponentType<IWidgetProps>;
    /** Table action permissions */
    actions?: {
        allowAdd?: boolean;
        allowDelete?: boolean;
        allowEdit?: boolean;
        allowSelect?: boolean;
    };
    /** Whether to show the inline editor directly inside the cell (boolean/dropdown) */
    inlineEdit?: boolean;
}

/** Pivot config for table widget */
export interface IPivotConfig {
    /** Static pivot: fixed row examples */
    examples?: Record<string, unknown>[];
    /** Dynamic pivot: field name of the dropdown whose options feed the rows */
    dropdown?: string;
    /** Key mapping from examples/options to data array */
    join: {
        example?: string;
        option?: string;
        item: string;
    };
}

/** Field configuration within a card */
export interface IFieldConfig {
    title?: string;
    widget?: Partial<IWidgetConfig>;
    readOnly?: boolean;
    hidden?: boolean;
    required?: boolean;
}

/** Card configuration */
export interface ICardConfig {
    label?: string;
    /** Field list for this card (preferred alias: widgets) */
    fields?: Record<string, IFieldConfig> | string[];
    /** Alias for fields */
    widgets?: string[];
    className?: string;
    readOnly?: boolean;
    collapsible?: boolean;
    loading?: boolean;
    /** When true: card is not shown visually; fields render as hidden inputs */
    hidden?: boolean;
    /** Permission key required to display this card. If set and no checkPermission
     *  callback is provided (or it returns false), the card is not rendered. */
    permission?: string;
    /** Watch path for reactive cards (e.g. '$.selected.personTable') */
    watch?: string;
    /** Match condition to show polymorphic detail cards */
    match?: Record<string, unknown>;
    /** Parent table path for master-detail */
    parent?: string;
    /** Master-detail key mapping */
    master?: Record<string, string>;
    autoSelect?: boolean;
}

/** Props that every widget component receives */
export interface IWidgetProps {
    name: string;
    schema: IEnrichedFieldSchema;
    value: unknown;
    onChange: (value: unknown) => void;
    onBlur: () => void;
    error?: {message?: string};
    readOnly?: boolean;
    loading?: boolean;
    disabled?: boolean;
    /** All current form values — enables inter-widget reactivity (cascaded dropdowns etc.) */
    formValues?: Record<string, unknown>;
    /**
     * Called by table widgets when a row is selected (selectionMode: 'single').
     * Passes null when the selection is cleared.
     */
    onSelect?: (selection: {row: Record<string, unknown>; index: number} | null) => void;
}

/** Widget registry interface */
export interface IWidgetRegistry {
    register(type: string, component: React.ComponentType<IWidgetProps>): void;
    get(type: string): React.ComponentType<IWidgetProps> | undefined;
    list(): string[];
}

/** Enriched field schema — normalized JSON Schema with widget config */
export interface IEnrichedFieldSchema {
    title?: string;
    type?: string;
    /** JSON Schema format (e.g. 'date', 'date-time', 'email') */
    format?: string;
    description?: string;
    /** Placeholder text for input widgets */
    placeholder?: string;
    minLength?: number;
    maxLength?: number;
    minimum?: number;
    maximum?: number;
    pattern?: string;
    enum?: unknown[];
    readOnly?: boolean;
    required?: boolean;
    /** Normalized widget config */
    widget?: IWidgetConfig;
    /** JSON Schema items — describes the shape of array-field rows (used by TableWidget) */
    items?: {
        properties?: Record<string, Record<string, unknown>>;
    };
    /** Include field in filter panel */
    'x-filter'?: boolean;
    /** Enable inline column filtering (shows filter row in DataTable) */
    'x-filterable'?: boolean;
    /** Enable column sorting */
    'x-sort'?: boolean;
    /** Action method name — renders the field cell as a clickable link */
    action?: string;
    /** Card names to show this field in */
    'x-cards'?: string[];
    /** Raw x-widget extension from OpenAPI */
    'x-widget'?: Partial<IWidgetConfig>;
    /** Field name */
    name?: string;
}

/** Enriched object schema — normalized JSON Schema for an entity */
export interface IEnrichedSchema {
    title?: string;
    description?: string;
    properties?: Record<string, IEnrichedFieldSchema>;
    required?: string[];
    /** Schema name (e.g. 'model.tree') */
    name?: string;
}
