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
export {useAppStore, type ITranslationBundle} from './state/appStore.js';

// ── Hooks ────────────────────────────────────────────────────────────────────
export {useAction} from './hooks/useAction.js';
export {useAsync} from './hooks/useAsync.js';
export {useAuth} from './hooks/useAuth.js';
export {
    useCommanderNav,
    type CommanderPane,
    type ICommanderKeyHandlers,
} from './hooks/useCommanderNav.js';
export {useDarkMode} from './hooks/useDarkMode.js';
export {useFilter} from './hooks/useFilter.js';
export {useHandler, useHandlerCall, useHandlerMutation} from './hooks/useHandler.js';
export {useLayout} from './hooks/useLayout.js';
export {useLoader} from './hooks/useLoader.js';
export {useLocalStorage} from './hooks/useLocalStorage.js';
export {usePermission} from './hooks/usePermission.js';
export {usePortal} from './hooks/usePortal.js';
export {useSubmit} from './hooks/useSubmit.js';
export {useOptionLabel, useText, useTranslate} from './hooks/useText.js';
export {useToast} from './hooks/useToast.js';

// ── Components ───────────────────────────────────────────────────────────────
export {AccountMenu, type IAccountMenuProps} from './components/AccountMenu/AccountMenu.js';
export {ActionButton} from './components/ActionButton/ActionButton.js';
export {App, type IAppProps} from './components/App/App.js';
export {Async} from './components/Async/Async.js';
export {Button, type ButtonProps} from './components/Button/Button.js';
export {Card} from './components/Card/Card.js';
export {
    Commander,
    type ICommanderLevel,
    type ICommanderProps,
    type ICommanderSource,
} from './components/Commander/Commander.js';
export {PathBar, type IPathSegment} from './components/Commander/PathBar.js';
export {DateRange} from './components/DateRange/DateRange.js';
export {Deck} from './components/Deck/Deck.js';
export {Editor, resolveTabTitle, type EditorMode} from './components/Editor/Editor.js';
export {ErrorDialog} from './components/Error/Error.js';
export {Explorer} from './components/Explorer/Explorer.js';
export {Form} from './components/Form/Form.js';
export {Hint} from './components/Hint/Hint.js';
export {Json} from './components/Json/Json.js';
export {
    LanguageSwitcher,
    type ILanguageOption,
    type ILanguageSwitcherProps,
} from './components/LanguageSwitcher/LanguageSwitcher.js';
export {Loader} from './components/Loader/Loader.js';
export {Login} from './components/Login/Login.js';
export {LoginPopup} from './components/LoginPopup/LoginPopup.js';
export {Navigator} from './components/Navigator/Navigator.js';
export type {INavigatorProps} from './components/Navigator/Navigator.js';
export {OAuthCallback, type IOAuthCallbackProps} from './components/OAuthCallback/OAuthCallback.js';
export {Page} from './components/Page/Page.js';
export {Permission} from './components/Permission/Permission.js';
export {Portal} from './components/Portal/Portal.js';
export {Report} from './components/Report/Report.js';
export {
    SelfRegistration,
    type ISelfRegistrationProps,
} from './components/SelfRegistration/SelfRegistration.js';
export {
    SocialLoginButton,
    type ISocialLoginButtonProps,
} from './components/SocialLoginButton/SocialLoginButton.js';
export {
    BrowserTestRunSource,
    pendingBrowserRun,
    projectBrowserRun,
} from './components/TestRun/browserTestRunSource.js';
export type {IBrowserTestRunOptions} from './components/TestRun/browserTestRunSource.js';
export {PollingTestRunSource} from './components/TestRun/pollingTestRunSource.js';
export type {
    IPollingTestRunOptions,
    ITestRunEventPage,
    ITestRunServerTransport,
} from './components/TestRun/pollingTestRunSource.js';
export {TestRun} from './components/TestRun/TestRun.js';
export {createTestRunCatalogHandler} from './components/TestRun/testRunCatalogHandler.js';
export type {ITestRunCatalogSettings} from './components/TestRun/testRunCatalogHandler.js';
export {TestRunPage} from './components/TestRun/TestRunPage.js';
export type {ITestRunCatalogEntry, ITestRunPageProps} from './components/TestRun/TestRunPage.js';
export {Text} from './components/Text/Text.js';
export {
    Theme,
    useTheme,
    useThemePalette,
    type IThemeConfig,
    type IThemeContextValue,
    type PaletteType,
    type ThemeType,
    type ThemeVariant,
} from './components/Theme/Theme.js';
export {
    THEME_GROUPS,
    THEME_OPTIONS,
    type IPrimeThemeOption,
    type IThemeGroup,
} from './components/Theme/themeRegistry.js';
export {ThemeSwitcher, type IThemeSwitcherProps} from './components/ThemeSwitcher/ThemeSwitcher.js';
export {ThumbIndex} from './components/ThumbIndex/ThumbIndex.js';
export {bgLocale} from './primereact/locales.js';
export {
    DEFAULT_DIAGRAM_RENDERER,
    DiagramViewer,
    getDiagramRenderer,
    listDiagramRenderers,
    MermaidRenderer,
    registerDiagramRenderer,
    type DiagramRenderer,
    type IDiagramRendererProps,
    type IDiagramViewerProps,
} from './viewers/diagram/index.js';

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
    getViewer,
    hasViewer,
    JsonViewer,
    KeyValueViewer,
    listViewers,
    MessageViewer,
    PodLogViewer,
    registerBuiltinViewers,
    registerViewer,
    SecretViewer,
    TableViewer,
    YamlViewer,
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

// Feedback mode (`@@T-462`): the toggle, the overlay, the target hook and the
// pure helpers its tests reach.
export * from './feedback/index.js';

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

export type {
    ITestAssertionCounts,
    ITestAssertionModel,
    ITestEdgeModel,
    ITestGraphEdgeLayout,
    ITestGraphLayout,
    ITestGraphNodeLayout,
    ITestGroupModel,
    ITestLogEntryModel,
    ITestLogRowModel,
    ITestProgressTreeNode,
    ITestRunCounts,
    ITestRunEvent,
    ITestRunModel,
    ITestRunRecording,
    ITestRunRowLayout,
    ITestRunSource,
    ITestRunTreeLayout,
    ITestRunViewProps,
    ITestSourceLinkConfig,
    ITestSourcePointer,
    ITestStepError,
    ITestStepModel,
    TestRunFilter,
    TestRunHost,
    TestRunOrder,
    TestRunStatus,
    TestStepStatus,
} from './types/testRun.js';

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
