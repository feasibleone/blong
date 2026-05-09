/**
 * @feasibleone/blong-browser — public API.
 *
 * Primary entry point. Import from here for all UI components, hooks,
 * and types.
 *
 * For the blong realm integration (browser entry, adapters, orchestrators),
 * import from '@feasibleone/blong-browser/browser.js'.
 */

// ── Context ──────────────────────────────────────────────────────────────────
export {BlongUiProvider, useBlongUi} from './context/BlongUiContext.js';
export type {
    DispatchFn,
    IBlongUiContextValue,
    IBlongUiProviderProps,
} from './context/BlongUiContext.js';

// ── State ────────────────────────────────────────────────────────────────────
export {useAppStore} from './state/appStore.js';

// ── Hooks ────────────────────────────────────────────────────────────────────
export {useAction} from './hooks/useAction.js';
export {useAsync} from './hooks/useAsync.js';
export {useAuth} from './hooks/useAuth.js';
export {useDarkMode} from './hooks/useDarkMode.js';
export {useFilter} from './hooks/useFilter.js';
export {useHandler, useHandlerCall, useHandlerMutation} from './hooks/useHandler.js';
export {useLayout} from './hooks/useLayout.js';
export {useLoader} from './hooks/useLoader.js';
export {useLocalStorage} from './hooks/useLocalStorage.js';
export {usePermission} from './hooks/usePermission.js';
export {usePortal} from './hooks/usePortal.js';
export {useSubmit} from './hooks/useSubmit.js';
export {useText} from './hooks/useText.js';
export {useToast} from './hooks/useToast.js';

// ── Components ───────────────────────────────────────────────────────────────
export {ActionButton} from './components/ActionButton/index.js';
export {App, type IAppProps} from './components/App/index.js';
export {Async} from './components/Async/index.js';
export {Card} from './components/Card/index.js';
export {DateRange} from './components/DateRange/index.js';
export {Deck} from './components/Deck/index.js';
export {Editor} from './components/Editor/index.js';
export {ErrorDialog} from './components/Error/index.js';
export {Explorer} from './components/Explorer/index.js';
export {Form} from './components/Form/index.js';
export {Hint} from './components/Hint/index.js';
export {Json} from './components/Json/index.js';
export {Loader} from './components/Loader/index.js';
export {Login} from './components/Login/index.js';
export {Navigator} from './components/Navigator/index.js';
export {Page} from './components/Page/index.js';
export {Permission} from './components/Permission/index.js';
export {Portal} from './components/Portal/index.js';
export {Report} from './components/Report/index.js';
export {Text} from './components/Text/index.js';
export {Theme} from './components/Theme/index.js';
export {ThumbIndex} from './components/ThumbIndex/index.js';

// ── Design Mode ──────────────────────────────────────────────────────────────
export {DesignModeContext, DesignModeProvider} from './design/DesignModeContext.js';
export {DesignToolbar} from './design/DesignToolbar.js';
export {useDesignMode} from './design/useDesignMode.js';

// ── Widgets ──────────────────────────────────────────────────────────────────
export {registerBuiltinWidgets, widgetRegistry} from './widgets/index.js';

// ── Schema ───────────────────────────────────────────────────────────────────
export {schemaRegistry} from './schema/registry.js';
export {buildValidationRules} from './schema/validate.js';

// ── Event bus ────────────────────────────────────────────────────────────────
export {blongEvents} from './lib/eventBus.js';
export type {BlongEventMap} from './lib/eventBus.js';

// ── Types ────────────────────────────────────────────────────────────────────
export type {
    ActionRegistry,
    IAction,
    IBlongError,
    IMutationAction,
    IPageAction,
    IQueryAction,
    IUseActionResult,
} from './types/action.js';

export type {
    IActionRef,
    ICardConfig,
    IEnrichedFieldSchema,
    IEnrichedSchema,
    IFieldConfig,
    IToolbarButton,
    IWidgetConfig,
    IWidgetProps,
    IWidgetRegistry,
    WidgetType,
} from '@feasibleone/blong';

export type {IMenuItem, IPortalConfig, IPortalState, ITab} from './types/portal.js';

export type {IAuthState, IUserProfile, PermissionMap} from './types/permission.js';

export type {ISchemaDocument, ISchemaRegistry} from './types/schema.js';

export type {ILayoutResult, IResolvedCard, LayoutConfig} from './hooks/useLayout.js';

// ── Model system ─────────────────────────────────────────────────────────────
export {dropdownRegistry, withDefaults} from './model/index.js';
export type {
    IBrowserConfig,
    IBrowserPermissions,
    IDropdownOption,
    IEditorConfig,
    ILayoutTab,
    IMethodsConfig,
    IModelSpec,
    IPartialModelSpec,
    IPropertyOverride,
    IReportConfig,
    IResolvedModelSpec,
    ISchemaOverlay,
    IWidgetOverride,
} from './model/index.js';

export {Model} from './model/Model.js';
