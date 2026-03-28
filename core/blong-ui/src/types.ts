/**
 * Shared types for the Blong browser UI framework.
 *
 * These types define the metadata structures used by the component factory
 * to generate forms, tables and detail views from OpenAPI schemas.
 */

import type {OpenAPIV3_1} from 'openapi-types';

// ── x-blong-* OpenAPI extension types ─────────────────────────────────────────

/** Widget type override for a schema property. */
export type BlongWidgetType =
    // Scalar widgets
    | 'input'
    | 'password'
    | 'text'
    | 'mask'
    | 'number'
    | 'currency'
    | 'integer'
    | 'boolean'
    | 'date'
    | 'time'
    | 'datetime'
    | 'dropdown'
    | 'dropdownTree'
    | 'select'
    // Scalar array widgets
    | 'multiSelect'
    | 'multiSelectTree'
    | 'selectTable'
    | 'multiSelectPanel'
    | 'multiSelectTreeTable'
    // Vector array widgets
    | 'table'
    // Special widgets
    | 'file';

/** Extension fields added to JSON Schema properties via `x-blong-*`. */
export interface BlongExtensions {
    /** Override the auto-detected widget type. */
    'x-blong-widget'?: BlongWidgetType;
    /** Hide this field from the UI (still present in data). */
    'x-blong-hidden'?: boolean;
    /** Display order within a card (lower = first). */
    'x-blong-order'?: number;
    /** Card group assignment. */
    'x-blong-group'?: string;
    /** Mark as lookup field — value is the lookup type identifier. */
    'x-blong-lookup'?: string;
    /** Layout assignment for this property. */
    'x-blong-layout'?: string;
    /** Column configuration for table display. */
    'x-blong-column'?: ColumnConfig;
    /** Input mask pattern (for mask widget). */
    'x-blong-mask'?: string;
    /** Currency code (for currency widget). */
    'x-blong-currency'?: string;
    /** Placeholder text. */
    'x-blong-placeholder'?: string;
    /** Tooltip/help text. */
    'x-blong-tooltip'?: string;
    /** Whether the field is read-only. */
    'x-blong-readonly'?: boolean;
    /** Namespace for the OpenAPI schema. */
    'x-blong-namespace'?: string;
}

/** A JSON Schema property augmented with blong extensions. */
export type BlongSchemaProperty = OpenAPIV3_1.SchemaObject & BlongExtensions;

/** A JSON Schema object augmented with blong extensions. */
export type BlongSchema = OpenAPIV3_1.SchemaObject & {
    properties?: Record<string, BlongSchemaProperty>;
} & BlongExtensions;

// ── Column Configuration ──────────────────────────────────────────────────────

/** Per-column configuration for table display. */
export interface ColumnConfig {
    /** Column header label override. */
    header?: string;
    /** Whether the column is sortable. */
    sortable?: boolean;
    /** Whether the column is filterable. */
    filter?: boolean;
    /** Column width (CSS value). */
    width?: string;
    /** Whether the column is hidden. */
    hidden?: boolean;
    /** Formatter function name. */
    formatter?: string;
}

// ── Widget Categories ─────────────────────────────────────────────────────────

/** Scalar widget — renders a single primitive value. */
export interface ScalarWidget {
    category: 'scalar';
    type: Extract<
        BlongWidgetType,
        | 'input'
        | 'password'
        | 'text'
        | 'mask'
        | 'number'
        | 'currency'
        | 'integer'
        | 'boolean'
        | 'date'
        | 'time'
        | 'datetime'
        | 'dropdown'
        | 'dropdownTree'
        | 'select'
    >;
}

/** Scalar array widget — selects one or more values from a list. */
export interface ScalarArrayWidget {
    category: 'scalarArray';
    type: Extract<
        BlongWidgetType,
        'multiSelect' | 'multiSelectTree' | 'selectTable' | 'multiSelectPanel' | 'multiSelectTreeTable'
    >;
}

/** Vector array widget — editable table with per-column widgets. */
export interface VectorArrayWidget {
    category: 'vectorArray';
    type: 'table';
    columns: WidgetColumn[];
}

/** A column definition within a vector array (table) widget. */
export interface WidgetColumn {
    field: string;
    header: string;
    widget: ScalarWidget | ScalarArrayWidget;
}

/** Union of all widget descriptors. */
export type WidgetDescriptor = ScalarWidget | ScalarArrayWidget | VectorArrayWidget;

// ── Cards ─────────────────────────────────────────────────────────────────────

/** A named group of widgets displayed together in a card container. */
export interface Card {
    /** Unique card identifier. */
    id: string;
    /** Display label for the card header. */
    label?: string;
    /** CSS class applied to the card container. */
    className?: string;
    /** Widget field names to include in this card. Nested arrays create sub-groups. */
    widgets: (string | string[])[];
    /** Whether the card is hidden. */
    hidden?: boolean;
    /** Form field to observe for conditional visibility. */
    watch?: string;
    /** Object to match against the watched field value. */
    match?: Record<string, unknown>;
    /** Permission required to view this card. */
    permission?: string;
    /** Parent field for cascaded table filtering. */
    parent?: string;
    /** Master field for master-detail linking. */
    master?: string;
}

/** Map of card ID → Card definition. */
export type Cards = Record<string, Card>;

// ── Layouts ───────────────────────────────────────────────────────────────────

/** A mode-keyed layout definition controlling card arrangement. */
export interface Layout {
    /** Card IDs to display in this layout, in order. */
    cards: string[];
    /** Tab configuration for tabbed layouts. */
    items?: TabItem[];
    /** Tab orientation: horizontal or vertical. */
    orientation?: 'horizontal' | 'vertical';
}

/** A tab within a tabbed layout. */
export interface TabItem {
    /** Tab label. */
    label: string;
    /** Card IDs displayed in this tab. */
    cards: string[];
}

/**
 * Mode-keyed layout map. Keys follow the convention:
 * - `edit` / `editDefault` — default edit layout
 * - `create` / `createDefault` — default create layout
 * - `edit{TypeValue}` — polymorphic edit layout for a specific type
 * - `create{TypeValue}` — polymorphic create layout for a specific type
 */
export type Layouts = Record<string, Layout>;

// ── Dropdowns ─────────────────────────────────────────────────────────────────

/** A single option in a dropdown list. */
export interface DropdownOption {
    value: string | number;
    label: string;
    /** Parent value for cascaded filtering. */
    parent?: string | number;
}

/** Dropdown data keyed by lookup type identifier. */
export type Dropdowns = Record<string, DropdownOption[]>;

// ── Customisation ─────────────────────────────────────────────────────────────

/** Per-component customisation persisted via `ui.customization.edit/get`. */
export interface Customisation {
    /** Component identifier. */
    componentId: string;
    /** Schema property overrides (title, widget, hidden, etc.). */
    schema?: Record<string, Partial<BlongSchemaProperty>>;
    /** Card overrides (reorder widgets, hide cards, change labels). */
    cards?: Partial<Cards>;
    /** Layout overrides (reorder cards, change tabs). */
    layouts?: Partial<Layouts>;
}

// ── Pivot ─────────────────────────────────────────────────────────────────────

/** Static pivot configuration — pre-populate table with example rows. */
export interface StaticPivot {
    /** Static rows to seed the pivot table. */
    examples: Record<string, unknown>[];
    /** Field to join on between pivot rows and data. */
    join: string;
}

/** Dynamic pivot configuration — populate from dropdown data. */
export interface DynamicPivot {
    /** Dropdown identifier providing pivot rows. */
    dropdown: string;
    /** Field to join on between pivot rows and data. */
    join: string;
}

/** Union of pivot types. */
export type PivotConfig = StaticPivot | DynamicPivot;

// ── Custom Widgets ────────────────────────────────────────────────────────────

/** Internal components passed to custom widget implementations. */
export interface WidgetInternals {
    Input: React.ComponentType<{name: string; [key: string]: unknown}>;
    Label: React.ComponentType<{htmlFor: string; children: React.ReactNode}>;
    ErrorLabel: React.ComponentType<{name: string}>;
}

/** A custom widget component definition. */
export interface CustomWidget {
    /** The React component implementing the widget. */
    component: React.ComponentType<WidgetInternals & Record<string, unknown>>;
    /** Properties this widget manages (excluded from default rendering). */
    properties: string[];
}

/** Map of custom widget name → definition. */
export type CustomWidgets = Record<string, CustomWidget>;

// ── Component Handler Metadata ────────────────────────────────────────────────

/** Metadata returned by component handlers for portal menu generation. */
export interface ComponentMeta {
    /** Display title for the portal menu. */
    title: string;
    /** Permission required to access this component. */
    permission?: string;
    /** Component identifier. */
    componentId: string;
}

/** Portal menu item generated from component handler metadata. */
export interface PortalMenuItem {
    label: string;
    icon?: string;
    to: string;
    permission?: string;
    items?: PortalMenuItem[];
}

/** Portal configuration returned by `portal.params.get`. */
export interface PortalConfig {
    theme?: string;
    portalName?: string;
    menu: PortalMenuItem[];
}

// ── Form Submission ───────────────────────────────────────────────────────────

/** Form mode — determines which layout and API method to use. */
export type FormMode = 'create' | 'edit';

/** Internal form state keys (prefixed with `$`, excluded from submission). */
export interface InternalFormState {
    /** Original values for reset. */
    $original?: Record<string, unknown>;
    /** Modification tracking. */
    $modified?: Record<string, unknown>;
    /** Selected row(s) from tables. */
    $selected?: Record<string, unknown>;
    /** Edit state for master-detail. */
    $edit?: Record<string, unknown>;
}

// ── API Response Types ────────────────────────────────────────────────────────

/** Standard JSON-RPC error response from the Blong server. */
export interface RpcError {
    type: string;
    message: string;
    print?: string;
    validation?: ValidationError[];
    params?: Record<string, unknown>;
    cause?: RpcError;
    stack?: string;
}

/** A field-level validation error. */
export interface ValidationError {
    field: string;
    message: string;
    type?: string;
}

/** Paginated fetch response shape. */
export interface FetchResponse<T = Record<string, unknown>> {
    items: T[];
    pagination: {
        recordsTotal: number;
        pageSize: number;
        pageNumber: number;
    };
}

/** Fetch request parameters (for table data loading). */
export interface FetchParams {
    orderBy?: Array<{field: string; dir: 'asc' | 'desc'}>;
    paging?: {pageSize: number; pageNumber: number};
    criteria?: Record<string, unknown>;
}
