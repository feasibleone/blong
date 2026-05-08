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
    | 'imageUpload'
    | 'autocomplete'
    | 'table'
    | 'navigator'
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
    /** Options list for static select/multiSelect/select/tree widgets.
     * Flat options use `{value, label}`. TreeNode-style options use `{key, label, children}`. */
    options?: Array<{
        value?: unknown;
        label?: string;
        icon?: string;
        key?: string | number;
        children?: unknown[];
        [extra: string]: unknown;
    }>;
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
    /** Render this widget in read-only display mode regardless of card/form editability */
    readOnly?: boolean;
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
    /** Accepted file types (file/imageUpload widgets) */
    accept?: string;
    /** Maximum file size in bytes (file/image widgets) */
    maxSize?: number;
    /** Base URL prefix for image display (image/imageUpload widgets) */
    basePath?: string;
    /** Exclude boundary times (dateRange widget: end = 23:59:59 instead of 00:00:00 next day) */
    exclusive?: boolean;
    /** Show time-only pickers (dateRange/time widget) */
    timeOnly?: boolean;

    // ── table / navigator: external data loading ─────────────────────────────
    /**
     * Action name to load list data from the server (table + navigator widgets).
     * When set, the widget manages its own data loading, pagination, search, and
     * sort independently of the react-hook-form value.
     */
    listAction?: string;
    /** Static params merged into every `listAction` call */
    listParams?: Record<string, unknown>;
    /**
     * Property name in the `listAction` response that contains the rows array.
     * Defaults to `'items'`. Set to `''` to use the response directly as an array.
     */
    resultSet?: string;
    /** Initial rows per page for listAction mode (default 25) */
    pageSize?: number;
    /**
     * Primary key field name in row data — used for template resolution (`${id}`)
     * and for the DataTable `dataKey`. Defaults to `'id'`.
     */
    keyField?: string;
    /** Parent key field for navigator tree building (default 'parentId') */
    parentField?: string;

    // ── table: custom toolbar buttons ─────────────────────────────────────────
    /**
     * Custom toolbar buttons (left side). Support `${id}`, `${current}`, `${selected}`,
     * and `${current.field}` template resolution and `enabled: 'current' | 'selected'`.
     */
    toolbar?: IWidgetToolbarButton[];
    /** Custom toolbar buttons (right side) */
    toolbarRight?: IWidgetToolbarButton[];
}

/**
 * Toolbar button for widget-level toolbars (table, navigator).
 * Similar to IToolbarButton but scoped to widget-level row context.
 */
export interface IWidgetToolbarButton {
    label?: string;
    icon?: string;
    /** Direct RPC method name called via dispatch */
    method?: string;
    permission?: string;
    /** Confirmation dialog message before invoking */
    confirm?: string;
    /** Enabled condition based on current row selection */
    enabled?: boolean | 'current' | 'selected';
    /**
     * Params passed to the method. Supports template strings:
     * `${id}` → keyField value, `${current}` → current row,
     * `${selected}` → selected rows array, `${current.field}` → field of current row.
     */
    params?: Record<string, unknown> | string;
    /** Success hint text shown as overlay near the button after the action completes */
    successHint?: string;
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

/** Object entry in a card's widget list — renders the named array field as a table, showing only the specified columns */
export interface ICardWidgetEntry {
    /** Field name from the schema (must be a table/array field) */
    name: string;
    /** Unique render key (allows showing the same field multiple times with different column subsets) */
    id: string;
    /** Column names from the field's items.properties to display */
    widgets: string[];
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
    /** Alias for fields — supports plain field names or ICardWidgetEntry objects for column-subset table views */
    widgets?: (string | ICardWidgetEntry)[];
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
    /** Field id — forwarded to the inner control for label/id association (same value as name) */
    id?: string;
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
    onSelect?: (
        name: string,
        selection: {row: Record<string, unknown>; index: number} | null,
    ) => void;
    /** Dropdown option maps — keyed by dropdown name, each value is the options array.
     *  Passed to TableWidget so column-level dropdown schemas can resolve their options. */
    dropdowns?: Record<string, unknown[]>;
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
    /** Nested object properties — for composite/grouped fields accessed via dot-notation paths */
    properties?: Record<string, IEnrichedFieldSchema>;
    /** JSON Schema items — describes the shape of array-field rows (used by TableWidget) */
    items?: {
        properties?: Record<string, IEnrichedFieldSchema | Record<string, unknown>>;
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
