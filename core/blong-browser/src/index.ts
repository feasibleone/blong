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
export {BlongProvider, makeHandlerProxy, useBlong} from './context/BlongContext.js';
export type {
    IBlongContextValue,
    IBlongPortalConfig,
    IBlongProviderProps,
} from './context/BlongContext.js';

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
export {
    useCommanderNav,
    type CommanderPane,
    type ICommanderKeyHandlers,
} from './hooks/useCommanderNav.js';
export {usePortal} from './hooks/usePortal.js';
export {useSubmit} from './hooks/useSubmit.js';
export {useText} from './hooks/useText.js';
export {useToast} from './hooks/useToast.js';

// ── Components ───────────────────────────────────────────────────────────────
export {ActionButton} from './components/ActionButton/ActionButton.js';
export {AccountMenu, type IAccountMenuProps} from './components/AccountMenu/AccountMenu.js';
export {
    LanguageSwitcher,
    type ILanguageOption,
    type ILanguageSwitcherProps,
} from './components/LanguageSwitcher/LanguageSwitcher.js';
export {Button, type ButtonProps} from './components/Button/Button.js';
export {bgLocale} from './primereact/locales.js';
export {App, type IAppProps} from './components/App/App.js';
export {Async} from './components/Async/Async.js';
export {Card} from './components/Card/Card.js';
export {DateRange} from './components/DateRange/DateRange.js';
export {Deck} from './components/Deck/Deck.js';
export {Editor, resolveTabTitle, type EditorMode} from './components/Editor/Editor.js';
export {ErrorDialog} from './components/Error/Error.js';
export {Explorer} from './components/Explorer/Explorer.js';
export {Form} from './components/Form/Form.js';
export {Hint} from './components/Hint/Hint.js';
export {Json} from './components/Json/Json.js';
export {Loader} from './components/Loader/Loader.js';
export {Login} from './components/Login/Login.js';
export {LoginPopup} from './components/LoginPopup/LoginPopup.js';
export {Navigator} from './components/Navigator/Navigator.js';
export type {INavigatorProps} from './components/Navigator/Navigator.js';
export {Commander, type ICommanderLevel, type ICommanderProps, type ICommanderSource} from './components/Commander/Commander.js';
export {PathBar, type IPathSegment} from './components/Commander/PathBar.js';
export {OAuthCallback, type IOAuthCallbackProps} from './components/OAuthCallback/OAuthCallback.js';
export {Page} from './components/Page/Page.js';
export {Permission} from './components/Permission/Permission.js';
export {Portal} from './components/Portal/Portal.js';
export {Report} from './components/Report/Report.js';
export {SelfRegistration, type ISelfRegistrationProps} from './components/SelfRegistration/SelfRegistration.js';
export {SocialLoginButton, type ISocialLoginButtonProps} from './components/SocialLoginButton/SocialLoginButton.js';
export {Text} from './components/Text/Text.js';
export {Theme} from './components/Theme/Theme.js';
export {ThumbIndex} from './components/ThumbIndex/ThumbIndex.js';

// ── Form primitives (PrimeReact intermediaries for realm pages) ─────────────
export {
    Dropdown,
    InputText,
    Message,
    Password,
    type DropdownProps,
    type InputTextProps,
    type MessageProps,
    type PasswordProps,
} from './primereact/index.js';

// ── Design Mode ──────────────────────────────────────────────────────────────
export {DesignModeContext, DesignModeProvider} from './design/DesignModeContext.js';
export {DesignToolbar} from './design/DesignToolbar.js';
export {useDesignMode} from './design/useDesignMode.js';

// ── Widgets ──────────────────────────────────────────────────────────────────
export {registerBuiltinWidgets, widgetRegistry} from './widgets/index.js';

// ── Viewers (commander leaf viewers) ───────────────────────────────────────
export {
    DocumentViewer,
    FileImageViewer,
    JsonViewer,
    KeyValueViewer,
    MessageViewer,
    PodLogViewer,
    SecretViewer,
    TableViewer,
    YamlViewer,
    getViewer,
    hasViewer,
    listViewers,
    registerBuiltinViewers,
    registerViewer,
} from './viewers/index.js';
export type {CommanderViewer, ICommanderViewerProps} from './viewers/registry.js';
export {
    resolveViewer,
    type ICommanderLeafMeta,
    type ICommanderModelRef,
    type IResolvedViewer,
} from './viewers/resolveViewer.js';

// ── Schema ───────────────────────────────────────────────────────────────────
export {schemaRegistry} from './schema/registry.js';
export {buildValidationRules} from './schema/validate.js';

// ── Event bus ────────────────────────────────────────────────────────────────
export {blongEvents} from './lib/eventBus.js';
export type {BlongEventMap} from './lib/eventBus.js';

// ── Types ────────────────────────────────────────────────────────────────────
export type {
    ActionRegistry,
    IBlongError,
    IMutationAction,
    IPageAction,
    IQueryAction,
    ITypedAction,
    IUseActionResult,
} from './types/action.js';

export type {
    IAction,
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
export {dropdownRegistry} from './model/index.js';
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
