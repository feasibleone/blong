/**
 * Action type definitions.
 * Actions are the unified concept for all interactions in the browser —
 * navigation, data queries, and mutations.
 */

/** A lazy async import returning a React component class/function */
export type ComponentImport = () => Promise<React.ComponentType<Record<string, unknown>>>;

/** Params can be a plain object or a function that derives params from a source object */
export type ParamsResolver<T = Record<string, unknown>> =
    | Partial<T>
    | ((contextData: Record<string, unknown>) => Partial<T>);

/** Page action — opens a component in a portal tab */
export interface IPageAction {
    type?: 'page';
    title: string;
    permission?: string;
    icon?: string;
    /** Async import returning a React component */
    component: ComponentImport;
    /** Static params merged into the tab open call */
    params?: ParamsResolver;
}

/** Query action — fetches data through the browser orchestrator; result is cached */
export interface IQueryAction {
    type?: 'query';
    title?: string;
    permission?: string;
    /** Orchestrator method to call (e.g. 'model.tree.fetch') */
    method: string;
    /** Alias for method */
    handler?: string;
    params?: ParamsResolver;
}

/** Mutation action — calls orchestrator and invalidates caches on success */
export interface IMutationAction {
    type?: 'mutation';
    title?: string;
    permission?: string;
    /** Orchestrator method to call */
    method: string;
    /** Alias for method */
    handler?: string;
    mutates: true;
    /** Action names whose caches should be invalidated on success */
    invalidates?: string[];
    params?: ParamsResolver;
}

export type IAction = IPageAction | IQueryAction | IMutationAction;

/** Registry of named actions */
export type ActionRegistry = Record<string, IAction>;

/** Extended action reference — action name plus static params override */
export interface IActionRef {
    name: string;
    params?: Record<string, unknown>;
}

/** Toolbar button configuration */
export interface IToolbarButton {
    label?: string;
    icon?: string;
    /** Action name (string) or extended ref */
    action?: string | IActionRef;
    /** Direct RPC method name (bypass action registry) */
    method?: string;
    permission?: string;
    /** Trigger form submit before invoking */
    submit?: boolean;
    /** Confirmation dialog message before invoking */
    confirm?: string;
    /** Enabled condition */
    enabled?: boolean | 'dirty' | 'clean' | 'current' | 'selected';
    visible?: boolean;
    align?: 'left' | 'right';
    /** Split-button sub-items */
    menu?: IToolbarButton[];
    /** Extra params passed to the action/method on invocation.
     * May be a plain object or a string template using `${field}`, `${current}`,
     * `${selected}` and `${current.field}` syntax for row-context interpolation. */
    params?: Record<string, unknown> | string;
    /** Success hint text shown in an overlay near the button after the action completes */
    successHint?: string;
}

/** Return type of useAction hook */
export interface IUseActionResult<TResult = unknown> {
    call: (params?: Record<string, unknown>) => Promise<TResult | void> | void;
    open: (params?: Record<string, unknown>) => void;
    data?: TResult;
    loading: boolean;
    error?: IBlongError;
    refetch?: () => Promise<TResult>;
}

/** Structured error shape from backend */
export interface IBlongError {
    type: string;
    message: string;
    print?: string;
    validation?: Array<{field: string; message: string}>;
    params?: object;
    stack?: string;
    cause?: IBlongError;
}
