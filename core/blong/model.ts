import type {ICardConfig, IToolbarButton, LayoutConfig} from './widget.ts';
/**
 * Model system types.
 *
 * A ModelSpec describes one "subject.object" domain entity and drives:
 * - automatic Browse / New / Open / Report page generation
 * - schema enrichment (server OpenAPI merged with browser overlay)
 * - dropdown dependency tracking and caching
 */

/** {value, label} pair used in all dropdown and select widgets */
export interface IDropdownOption {
    value: unknown;
    label: string;
    [key: string]: unknown;
}

/** Widget metadata overlay  */
export interface IWidgetOverride {
    type?: string;
    /** Named dropdown: 'rule.country', 'marine.species', etc. */
    dropdown?: string;
    options?: Array<{value: unknown; label: string}>;
    keyValue?: boolean;
    fieldClass?: string;
    itemClassName?: string;
    label?: string;
    master?: Record<string, string>;
    parent?: string;
    autoSelect?: boolean;
    selectionMode?: 'single' | 'multiple';
    hidden?: string[];
    widgets?: string[];
    params?: Record<string, unknown>;
    [key: string]: unknown;
}

/** JSON Schema property overlay — the browser model adds/overrides field metadata */
export interface IPropertyOverride {
    title?: string;
    type?: string;
    filter?: boolean;
    sort?: boolean;
    required?: boolean;
    default?: unknown;
    widget?: IWidgetOverride;
    validation?: unknown;
    properties?: Record<string, IPropertyOverride>;
    items?: {properties?: Record<string, IPropertyOverride>};
    [key: string]: unknown;
}

/** Schema overlay — top-level properties map per subject.object */
export interface ISchemaOverlay {
    properties?: Record<string, IPropertyOverride>;
    [key: string]: unknown;
}

/** Named card layout — a group of fields rendered as one collapsible card */
export interface ICardOverride {
    className?: string;
    label?: string;
    title?: string;
    hidden?: boolean;
    widgets: Array<string | IInlineWidget>;
}

/** Inline widget descriptor (used inside card.widgets arrays) */
export interface IInlineWidget {
    name: string;
    type: string;
    page?: string;
    params?: Record<string, unknown>;
}

/** Tab in the editor layout */
export interface ILayoutTab {
    id: string;
    label?: string;
    icon?: string;
    widgets: Array<string | string[]>;
}

/** Permission names for each CRUD action */
export interface IBrowserPermissions {
    browse: string;
    add: string;
    edit: string;
    delete: string;
}

/** Browse page configuration */
export interface IBrowserConfig {
    title?: string;
    icon?: string;
    permission?: IBrowserPermissions;
    /** Default filter applied on page open */
    filter?: Record<string, unknown>;
    /** Result set key to use from server response */
    resultSet?: string;
    /** Extra toolbar buttons */
    toolbar?: IToolbarButton[];
}

export interface IBrowserConfigOptional {
    /** Column transformation applied to server fetch params */
    fetch?: (params: Record<string, unknown>) => Record<string, unknown>;
    /** Whether to show "Create" button */
    create?: Array<{title?: string; type?: string; permission?: string}>;
}

/** Editor page configuration */
export interface IEditorConfig {
    resultSet?: string;
}

/** Report page configuration */
export interface IReportConfig {
    title?: string;
    permission?: string;
}

/**
 * Named report definition — describes one named report variant for a model.
 * A report with id `${subject}${Capital(object)}List` is auto-generated from the
 * model spec; other ids require explicit definition in `IModelSpec.reports`.
 */
export interface IReportDefinition {
    /** Report title shown in the tab */
    title?: string;
    /** Permission required. Falls back to model's report permission */
    permission?: string;
    /**
     * Backend action to call when "Run Report" is submitted.
     * Defaults to `methods.find` for the auto-generated list report.
     */
    action?: string;
    /**
     * Field names to include in the params card (flat, from the object's properties).
     * Defaults to all fields with `filter: true` in the model schema.
     */
    params?: string[];
    /**
     * Column field names to show in the result table.
     * Defaults to the browse columns defined in the model.
     */
    columns?: string[];
    /**
     * Key in the action response that holds the rows array.
     * Defaults to `'items'` (consistent with `find` response shape).
     */
    resultSet?: string;
}

/** Method name overrides — defaults to semantic triple naming */
export interface IMethodsConfig {
    find?: string;
    get?: string;
    add?: string;
    edit?: string;
    remove?: string;
    report?: string;
}

/**
 * ModelSpec — the browser-side description of one "subject.object" domain entity.
 *
 * Used by modelFactory() to auto-generate Browse/New/Open/Report pages.
 */
export interface IModelSpec {
    /** Namespace / subject, e.g. 'marine', 'rule' */
    subject: string;
    /** Entity name, e.g. 'coral', 'condition' */
    object: string;
    /** Human-readable title, e.g. 'Coral'. Defaults to capitalized object. */
    objectTitle?: string;
    /** Primary key field path, e.g. 'coralId'. Defaults to `${object}Id`. */
    keyField?: string;
    /** Name field path (dotted), e.g. 'coral.coralName'. Defaults to `${object}.${object}Name`. */
    nameField?: string;
    /** JSON Schema overlay merged on top of server OpenAPI schema */
    schema?: ISchemaOverlay;
    /** Named card layout definitions */
    cards?: Record<string, ICardConfig>;
    /** Browse page configuration */
    browser?: IBrowserConfig & IBrowserConfigOptional;
    /** Editor page configuration */
    editor?: IEditorConfig;
    /** Report page configuration */
    report?: IReportConfig;
    /**
     * Named report definitions keyed by report id.
     * The id `${subject}${Capital(object)}List` is auto-generated from the model;
     * all other ids require an explicit entry here.
     */
    reports?: Record<string, IReportDefinition>;
    /** Tab layouts for editor */
    layouts?: Record<string, LayoutConfig>;
    /** Method name overrides */
    methods?: IMethodsConfig;
}

/** Model spec as accepted by modelFactory — objectTitle/keyField/nameField are optional */
export type IPartialModelSpec = IModelSpec;

/** Fully resolved model spec — all defaults filled in */
export interface IResolvedModelSpec extends Required<IModelSpec> {
    objectTitle: string;
    keyField: string;
    nameField: string;
    browser: Required<IBrowserConfig> & IBrowserConfigOptional;
    editor: Required<IEditorConfig>;
    report: Required<IReportConfig>;
    reports: Record<string, IReportDefinition>;
    methods: Required<IMethodsConfig>;
}

/** Mock OpenAPI document (minimal shape used by schemaFetcher) */
export interface IMockOpenApiDoc {
    paths?: Record<
        string,
        Record<
            string,
            {
                operationId?: string;
                requestBody?: {content?: {'application/json'?: {schema?: Record<string, unknown>}}};
                responses?: {
                    '200'?: {content?: {'application/json'?: {schema?: Record<string, unknown>}}};
                };
            }
        >
    >;
    'x-ui-customizations'?: Record<string, Record<string, unknown>>;
}

export interface IMock {
    /** Mock OpenAPI documents keyed by subject name */
    subjects?: Record<string, object[]>;
    /** Pre-populated dropdown data keyed by dropdown name */
    dropdowns?: Record<string, IDropdownOption[]>;
}
