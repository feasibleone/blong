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
    /** Options list for static select/multiSelect/select */
    options?: Array<{value: unknown; label: string; icon?: string}>;
    /** Parent field name for cascaded dropdowns */
    parent?: string;
    /** Copy-to-clipboard icon (input widget) */
    copy?: boolean;
    /** Mask pattern (mask widget) */
    mask?: string;
    /** Column definitions for table widget */
    columns?: Record<string, IFieldConfig>;
    /** Pivot config for static or dynamic pivots */
    pivot?: IPivotConfig;
    /** Field names to hide in table (used as implicit keys) */
    hidden?: string[];
    /** Selection mode for table widget */
    selectionMode?: 'single' | 'multiple';
    /** Label field name in fetched options */
    labelField?: string;
    /** Value field name in fetched options */
    valueField?: string;
    /** Custom component type (for 'custom' type) */
    component?: React.ComponentType<IWidgetProps>;
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
    label: string;
    fields?: Record<string, IFieldConfig> | string[];
    readOnly?: boolean;
    collapsible?: boolean;
    loading?: boolean;
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
    description?: string;
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
    /** Include field in filter panel */
    'x-filter'?: boolean;
    /** Enable column sorting */
    'x-sort'?: boolean;
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
