/**
 * @feasibleone/blong-ui — Metadata-driven browser UI framework for Blong.
 *
 * Public API exports.
 */

// ── Types ─────────────────────────────────────────────────────────────────────
export type {
    BlongExtensions,
    BlongSchema,
    BlongSchemaProperty,
    BlongWidgetType,
    Card,
    Cards,
    ColumnConfig,
    ComponentMeta,
    Customisation,
    CustomWidget,
    CustomWidgets,
    DropdownOption,
    Dropdowns,
    DynamicPivot,
    FetchParams,
    FetchResponse,
    FormMode,
    InternalFormState,
    Layout,
    Layouts,
    PivotConfig,
    PortalConfig,
    PortalMenuItem,
    RpcError,
    ScalarArrayWidget,
    ScalarWidget,
    StaticPivot,
    TabItem,
    ValidationError,
    VectorArrayWidget,
    WidgetColumn,
    WidgetDescriptor,
    WidgetInternals,
} from './types.js';

// ── Factory ───────────────────────────────────────────────────────────────────
export {resolveWidgetType, resolveWidgetDescriptor, getPrimeComponent} from './factory/WidgetMap.js';
export {resolveField, resolveFields, renderField} from './factory/FieldResolver.js';
export type {ResolvedField} from './factory/FieldResolver.js';
export {
    deriveCardsFromSchema,
    resolveCards,
    getCardFieldNames,
    filterCardsByPermission,
    isCardVisible,
} from './factory/CardResolver.js';
export {
    deriveDefaultLayout,
    deriveLayouts,
    resolveLayouts,
    createTabbedLayout,
    getTabCards,
    isTabbedLayout,
} from './factory/LayoutResolver.js';
export {FormFactory} from './factory/FormFactory.js';
export type {FormFactoryProps} from './factory/FormFactory.js';
export {
    prepareSubmit,
    mergeResponse,
    snapshotOriginal,
    createSubmitHandler,
    prepareMultipartSubmit,
} from './factory/FormSubmit.js';
export {TableFactory, deriveColumns} from './factory/TableFactory.js';
export type {TableFactoryProps, TableColumn} from './factory/TableFactory.js';
export {DetailFactory} from './factory/DetailFactory.js';
export type {DetailFactoryProps} from './factory/DetailFactory.js';

// ── Components ────────────────────────────────────────────────────────────────
export {FormCard} from './components/FormCard.js';
export type {FormCardProps} from './components/FormCard.js';
export {TableCard} from './components/TableCard.js';
export type {TableCardProps} from './components/TableCard.js';
export {DetailCard} from './components/DetailCard.js';
export type {DetailCardProps} from './components/DetailCard.js';
export {ReportCard} from './components/ReportCard.js';
export type {ReportCardProps} from './components/ReportCard.js';
export {PageShell} from './components/PageShell.js';
export type {PageShellProps} from './components/PageShell.js';
export {ErrorBoundary, RpcErrorDisplay, setFormErrors} from './components/ErrorBoundary.js';
export type {ErrorBoundaryProps} from './components/ErrorBoundary.js';

// ── Hooks ─────────────────────────────────────────────────────────────────────
export {useSchema, lookupMethodSchema} from './hooks/useSchema.js';
export type {UseSchemaOptions, MethodSchema} from './hooks/useSchema.js';
export {
    useRpcQuery,
    useRpcFetch,
    useRpcMutation,
    rpcCall,
    setApiConfig,
    getApiConfig,
} from './hooks/useApi.js';
export type {
    ApiConfig,
    UseRpcQueryOptions,
    UseRpcFetchOptions,
    UseRpcMutationOptions,
} from './hooks/useApi.js';
export {useDropdown, discoverDropdownFields} from './hooks/useDropdown.js';
export type {UseDropdownOptions} from './hooks/useDropdown.js';
export {useCustomization} from './hooks/useCustomization.js';
export type {UseCustomizationOptions} from './hooks/useCustomization.js';
export {usePermissions} from './hooks/usePermissions.js';
export {useLayout, resolveLayout} from './hooks/useLayout.js';
export type {UseLayoutOptions} from './hooks/useLayout.js';
export {useDesign, DesignContext} from './hooks/useDesign.js';
export type {DesignContextValue} from './hooks/useDesign.js';
export {useTheme, useThemeProvider, ThemeContext} from './hooks/useTheme.js';
export type {ThemeContextValue, ThemeMode} from './hooks/useTheme.js';

// ── Auth ──────────────────────────────────────────────────────────────────────
export {AuthProvider, useAuth} from './auth/AuthProvider.js';
export type {AuthProviderProps, AuthContextValue, AuthState, AuthUser} from './auth/AuthProvider.js';
export {LoginForm} from './auth/LoginForm.js';
export type {LoginFormProps} from './auth/LoginForm.js';
export {ProtectedRoute} from './auth/ProtectedRoute.js';
export type {ProtectedRouteProps} from './auth/ProtectedRoute.js';

// ── Design ────────────────────────────────────────────────────────────────────
export {DesignEditor} from './design/DesignEditor.js';
export type {DesignEditorProps} from './design/DesignEditor.js';
export {ConfigCard} from './design/ConfigCard.js';
export type {ConfigCardProps} from './design/ConfigCard.js';
export {ConfigField} from './design/ConfigField.js';
export type {ConfigFieldProps} from './design/ConfigField.js';
export {Inspector} from './design/Inspector.js';
export type {InspectorProps} from './design/Inspector.js';
export {SelectField} from './design/SelectField.js';
export type {SelectFieldProps} from './design/SelectField.js';
export {SelectCard} from './design/SelectCard.js';
export type {SelectCardProps} from './design/SelectCard.js';
export {useDesignStore} from './design/DesignStore.js';
export type {DesignStoreOptions} from './design/DesignStore.js';
