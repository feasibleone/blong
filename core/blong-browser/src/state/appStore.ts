/**
 * Global application Zustand store.
 * Manages auth state, portal tabs, toasts, and loader.
 */
import type {ReactNode} from 'react';
import {create} from 'zustand';
import type {IFeedbackItem} from '@feasibleone/blong';
import {composeTranslations} from '../i18n/bundled.js';
import {setTranslationProvider} from '../i18n/collect.js';
import type {IFormatConfig} from '../lib/format.js';
import type {ActionRegistry, IBlongError} from '../types/action.js';
import type {IAuthState, IUserProfile, PermissionMap} from '../types/permission.js';
import type {IPortalConfig, IPortalState, ITab} from '../types/portal.js';

/** Toast notification */
export interface IToast {
    id: string;
    severity: 'success' | 'info' | 'warn' | 'error';
    summary?: string;
    detail?: ReactNode;
    life?: number;
}

/** Translation dictionary */
export type TranslationDict = Record<string, string>;

/** Inline hint shown near a button (success or error feedback) */
export interface IHint {
    target: HTMLElement | null;
    message: string;
    error: boolean;
}

/**
 * The user's explicit theme choice (set by the theme switcher). Undefined
 * fields mean "not chosen" — the Theme component then derives them from the
 * `IThemeConfig` prop. Persisted to `localStorage` so the choice survives a
 * reload.
 */
export interface IThemeSelection {
    /** Selected theme-option id (e.g. `lara-blue`, `glass`). */
    themeId?: string;
    /** Selected palette for themes that offer both light and dark variants. */
    palette?: 'light' | 'dark';
    /**
     * Text direction. Set by the Storybook toolbar (the portal itself offers no
     * direction control), so it lives beside the user's theme choice and shares
     * its persistence — `Theme` reads it in preference to its `direction` prop,
     * which is how a toolbar toggle reaches a story whose container owns `Theme`.
     */
    direction?: 'ltr' | 'rtl';
}

const THEME_STORAGE_KEY = 'blong.theme';

function readThemeSelection(): IThemeSelection {
    if (typeof localStorage === 'undefined') return {};
    try {
        const raw = localStorage.getItem(THEME_STORAGE_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw) as {
            themeId?: unknown;
            palette?: unknown;
            direction?: unknown;
        };
        const selection: IThemeSelection = {};
        if (typeof parsed.themeId === 'string') selection.themeId = parsed.themeId;
        if (parsed.palette === 'light' || parsed.palette === 'dark')
            selection.palette = parsed.palette;
        if (parsed.direction === 'ltr' || parsed.direction === 'rtl') {
            selection.direction = parsed.direction;
        }
        return selection;
    } catch {
        return {};
    }
}

function writeThemeSelection(selection: IThemeSelection): void {
    if (typeof localStorage === 'undefined') return;
    try {
        if (!selection.themeId && !selection.palette && !selection.direction) {
            localStorage.removeItem(THEME_STORAGE_KEY);
        } else {
            localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(selection));
        }
    } catch {
        // Ignore storage failures (private mode, quota, …).
    }
}

/** One language's database half: the label dictionary. */
export interface ITranslationBundle {
    label?: TranslationDict;
}

/**
 * Feedback mode's draft (`@@T-461`).
 *
 * `active` is the only member the deep components subscribe to — a card, a field
 * row or a `Text` asks "am I addressable?" and nothing else. Hover geometry and
 * callout placement live in the overlay's own state, so moving the pointer over a
 * page does not re-render the page.
 */
export interface IFeedbackDraft {
    active: boolean;
    /** Draft comments by target id; one box per target, so a second click edits the first. */
    items: Record<string, IFeedbackItem>;
}

/** Complete app state */
export interface IAppState {
    auth: IAuthState;
    portal: IPortalState;
    toasts: IToast[];
    feedback: IFeedbackDraft;
    loader: {active: boolean; message?: string; count: number};
    translations: TranslationDict;
    /**
     * Per-language dictionaries registered by the app via
     * `setTranslationsByLanguage`.  When non-empty, `setLanguage` swaps the
     * active `translations` table to the matching language's dictionary
     * (English falls back to an empty dict = English strings).
     */
    translationsByLanguage: Record<string, TranslationDict>;
    /**
     * The database half, per language: the label dictionary. Loaded after login
     * and on a language switch, so a corrected translation needs no release. A
     * record's own name is not here on purpose — it is translated by the query
     * that reads it (`D-635`).
     */
    translationBundle: Record<string, ITranslationBundle>;
    /**
     * Reads one language's bundle from the server. `App` registers it from the
     * merged portal configuration, so a suite without `blong-core` simply has
     * none and the bundled dictionary remains the whole answer.
     */
    translationLoader?: (language: string) => Promise<ITranslationBundle>;
    /**
     * A dictionary set directly through `setTranslations`.
     *
     * It is the last layer and survives a language switch, which is the contract
     * tests and Storybook rely on: set the dictionary, then set the language.
     * `setTranslationsByLanguage` clears it, because that call declares the
     * configuration layer instead.
     */
    translationOverride?: TranslationDict;
    language: string;
    /**
     * Formatting configuration, resolved user → system → the language default by
     * `useFormatValue` (see `lib/format.ts`). The user layer is the person's own
     * preference and arrives with the profile; the system layer is the app's.
     */
    format: {user?: IFormatConfig; system?: IFormatConfig};
    actions: ActionRegistry;
    error: IBlongError | null;
    hint: IHint | null;
    /** Explicit theme choice made via the theme switcher (see IThemeSelection). */
    theme: IThemeSelection;
    /**
     * When true, the login popup is shown — set when an operation hits an
     * expired/invalid session (401) and the client-side token renewal failed.
     * The user logs in via the popup and re-invokes the operation.
     */
    loginPrompt: boolean;
}

/** App store actions */
export interface IAppActions {
    // Auth
    setToken: (token: string | null) => void;
    setProfile: (profile: IUserProfile | null) => void;
    setPermissions: (permissions: PermissionMap) => void;
    logout: () => void;

    // Portal
    openTab: (tab: ITab) => void;
    closeTab: (id: string) => void;
    setActiveTab: (id: string | null) => void;
    setTabDirty: (id: string, dirty: boolean) => void;
    setTabTitle: (id: string, title: string) => void;
    updateTabComponent: (
        id: string,
        component: React.ComponentType<Record<string, unknown>>,
    ) => void;
    setPortalConfig: (config: IPortalConfig | null) => void;

    // Toasts
    showToast: (toast: Omit<IToast, 'id'>) => void;
    clearToast: (id: string) => void;
    clearAllToasts: () => void;

    // Loader
    setLoading: (active: boolean, message?: string) => void;

    // Translations
    setTranslations: (dict: TranslationDict) => void;
    setTranslationsByLanguage: (dicts: Record<string, TranslationDict>) => void;
    setLanguage: (language: string) => void;
    setTranslationBundle: (language: string, bundle: ITranslationBundle) => void;
    setTranslationLoader: (loader?: (language: string) => Promise<ITranslationBundle>) => void;
    /**
     * Switch language and load its database bundle when it is not loaded yet.
     * The synchronous `setLanguage` is the one every caller keeps using; this is
     * the awaitable form a test or the login handler wants.
     */
    languageActivate: (language: string) => Promise<void>;

    // Formatting
    /** Set one layer of the formatting configuration; `undefined` clears it. */
    setFormat: (scope: 'user' | 'system', config: IFormatConfig | undefined) => void;

    // Actions registry
    registerActions: (actions: ActionRegistry) => void;

    // Error
    showError: (error: IBlongError) => void;
    clearError: () => void;

    // Theme
    /** Replace the explicit theme selection (persisted to localStorage). */
    setTheme: (selection: IThemeSelection) => void;
    /**
     * Merge a text direction into the theme selection. Separate from `setTheme`
     * because that one replaces: a caller that only knows the direction (the
     * Storybook toolbar) must not discard the theme and palette beside it.
     */
    setDirection: (direction: 'ltr' | 'rtl') => void;

    // Login prompt
    setLoginPrompt: (visible: boolean) => void;

    // Hint
    showHint: (target: HTMLElement | null, message: string, error: boolean) => void;
    clearHint: () => void;

    // Feedback mode
    /** Enter or leave the mode. Leaving keeps the draft until `feedbackReset`. */
    feedbackActivate: (active: boolean) => void;
    /** Add or replace one draft item, keyed by its logical target id. */
    feedbackAdd: (item: IFeedbackItem) => void;
    /** Patch one draft item (its comment as the person types). */
    feedbackUpdate: (targetId: string, patch: Partial<IFeedbackItem>) => void;
    feedbackRemove: (targetId: string) => void;
    /** Drop the whole draft and clear the target rings. */
    feedbackReset: () => void;
}

const initialAuth: IAuthState = {
    token: null,
    profile: null,
    permissions: {},
    isAuthenticated: false,
};

const initialPortal: IPortalState = {
    tabs: [],
    activeTabId: null,
    portalConfig: null,
};

let toastIdCounter = 0;

/** The bundle reads in flight, keyed by language, so a switch loads once. */
const pendingBundles = new Map<string, Promise<ITranslationBundle>>();

/**
 * The active dictionary for a language, from every layer.
 *
 * Composed on every write rather than on every render: `useText` then stays one
 * object lookup, and the collector reports exactly the dictionary the screen used.
 */
function appliedTranslations(
    state: Pick<IAppState, 'translationsByLanguage' | 'translationBundle' | 'translationOverride'>,
    language = (state as {language?: string}).language ?? 'en',
): Pick<IAppState, 'translations'> {
    const database: Record<string, TranslationDict> = {};
    for (const [code, bundle] of Object.entries(state.translationBundle)) {
        if (bundle.label) database[code] = bundle.label;
    }
    return {
        translations: {
            ...composeTranslations(language, state.translationsByLanguage, database),
            ...(state.translationOverride ?? {}),
        },
    };
}

/**
 * Mark the active language on the document.
 *
 * A Playwright test waits on `html[data-language]` instead of guessing how long a
 * dictionary load takes, the same trick the portal uses for its composed config.
 */
function markLanguage(language: string): void {
    if (typeof document !== 'undefined') {
        document.documentElement.dataset.language = language;
    }
}

export const useAppStore = create<IAppState & IAppActions>((set, get) => ({
    auth: initialAuth,
    portal: initialPortal,
    toasts: [],
    feedback: {active: false, items: {}},
    loader: {active: false, count: 0},
    translations: {},
    translationsByLanguage: {},
    translationBundle: {},
    language: 'en',
    format: {},
    actions: {},
    error: null,
    hint: null,
    theme: readThemeSelection(),
    loginPrompt: false,

    // Auth actions
    setToken: token =>
        set(state => ({
            auth: {...state.auth, token, isAuthenticated: token != null},
        })),
    setProfile: profile =>
        set(state => ({
            auth: {...state.auth, profile},
        })),
    setPermissions: permissions =>
        set(state => ({
            auth: {...state.auth, permissions},
        })),
    logout: () =>
        set({
            auth: initialAuth,
            portal: initialPortal,
            toasts: [],
        }),

    // Portal actions
    openTab: tab =>
        set(state => {
            // Navigate to existing tab with same action+params instead of duplicating
            const existing = state.portal.tabs.find(
                t =>
                    t.actionName === tab.actionName &&
                    JSON.stringify(t.params) === JSON.stringify(tab.params),
            );
            if (existing) {
                return {portal: {...state.portal, activeTabId: existing.id}};
            }
            return {
                portal: {
                    ...state.portal,
                    tabs: [...state.portal.tabs, tab],
                    activeTabId: tab.id,
                },
            };
        }),
    closeTab: id =>
        set(state => {
            const tabs = state.portal.tabs.filter(t => t.id !== id);
            const activeTabId =
                state.portal.activeTabId === id
                    ? (tabs[tabs.length - 1]?.id ?? null)
                    : state.portal.activeTabId;
            return {portal: {...state.portal, tabs, activeTabId}};
        }),
    setActiveTab: id => set(state => ({portal: {...state.portal, activeTabId: id}})),
    setTabDirty: (id, dirty) =>
        set(state => ({
            portal: {
                ...state.portal,
                tabs: state.portal.tabs.map(t => (t.id === id ? {...t, dirty} : t)),
            },
        })),
    setTabTitle: (id, title) =>
        set(state => ({
            portal: {
                ...state.portal,
                tabs: state.portal.tabs.map(t => (t.id === id ? {...t, title} : t)),
            },
        })),
    updateTabComponent: (id, component) =>
        set(state => ({
            portal: {
                ...state.portal,
                tabs: state.portal.tabs.map(t => (t.id === id ? {...t, component} : t)),
            },
        })),
    setPortalConfig: config => set(state => ({portal: {...state.portal, portalConfig: config}})),

    // Toast actions
    showToast: toast => {
        const id = String(++toastIdCounter);
        // Mirror error toasts to the browser console so agents and Playwright
        // tests can observe them via page.on('console') even when a transient
        // toast is missed by screenshot assertions.
        if (toast.severity === 'error') {
            console.error('[blong] error toast', toast.summary ?? '', toast.detail ?? '');
        }
        set(state => ({toasts: [...state.toasts, {...toast, id}]}));
        // Auto-dismiss
        const life = toast.life ?? (toast.severity === 'error' ? 8000 : 4000);
        setTimeout(() => get().clearToast(id), life);
    },
    clearToast: id => set(state => ({toasts: state.toasts.filter(t => t.id !== id)})),
    clearAllToasts: () => set({toasts: []}),

    // Loader actions
    setLoading: (active, message) =>
        set(state => {
            const count = state.loader.count + (active ? 1 : -1);
            return {loader: {active: count > 0, message, count: Math.max(0, count)}};
        }),

    // Translations
    //
    // The active dictionary is a layered merge — bundled, then the suite's portal
    // configuration, then the database — so a corrected translation needs no
    // release and the pre-session screens still translate (D-627). `setTranslations`
    // therefore writes the configuration layer for the active language rather than
    // replacing the table outright.
    setTranslations: dict =>
        set(state => ({
            translationOverride: dict,
            ...appliedTranslations({...state, translationOverride: dict}),
        })),
    setTranslationsByLanguage: dicts =>
        set(state => ({
            translationsByLanguage: dicts,
            translationOverride: undefined,
            // Re-apply the current language's dictionary immediately so the UI
            // reflects it even if the language was set before the dicts loaded.
            ...appliedTranslations({
                ...state,
                translationsByLanguage: dicts,
                translationOverride: undefined,
            }),
        })),
    setTranslationBundle: (language, bundle) =>
        set(state => {
            const translationBundle = {...state.translationBundle, [language]: bundle};
            return state.language === language
                ? {translationBundle, ...appliedTranslations({...state, translationBundle})}
                : {translationBundle};
        }),
    setTranslationLoader: loader => set({translationLoader: loader}),
    setLanguage: language => {
        set(state => {
            markLanguage(language);
            return {language, ...appliedTranslations(state, language)};
        });
        // A language whose database half has not been read yet is loaded now;
        // without a loader the bundled and configured layers are the answer.
        const {translationLoader, translationBundle, languageActivate} = get();
        if (translationLoader && !translationBundle[language]) void languageActivate(language);
    },
    languageActivate: async language => {
        set(state => {
            markLanguage(language);
            return {language, ...appliedTranslations(state, language)};
        });
        const {translationLoader, translationBundle, setTranslationBundle} = get();
        if (!translationLoader || translationBundle[language]) return;
        let pending = pendingBundles.get(language);
        if (!pending) {
            pending = translationLoader(language).finally(() => pendingBundles.delete(language));
            pendingBundles.set(language, pending);
        }
        try {
            setTranslationBundle(language, await pending);
        } catch {
            // A database without the tables, or a session without permission to
            // read them, must not break login: the bundled and configured layers
            // stay in place and the UI keeps its English fallback.
        }
    },

    // Formatting — one layer at a time; the hook resolves the chain.
    setFormat: (scope, config) =>
        set(state => ({
            format: {...state.format, [scope]: config},
        })),

    // Actions registry
    registerActions: actions => set(state => ({actions: {...state.actions, ...actions}})),
    // Error
    showError: error => {
        // Mirror the error popup (ErrorDialog) to the browser console so agents
        // and Playwright tests can observe it via page.on('console').
        console.error('[blong] error dialog', error.type, error.print ?? error.message, error);
        set({error});
    },
    clearError: () => set({error: null}),

    // Theme
    setTheme: selection => {
        writeThemeSelection(selection);
        set({theme: selection});
    },
    setDirection: direction =>
        set(state => {
            if (state.theme.direction === direction) return {};
            const theme = {...state.theme, direction};
            writeThemeSelection(theme);
            return {theme};
        }),

    // Login prompt
    setLoginPrompt: visible => set({loginPrompt: visible}),

    // Hint
    showHint: (target, message, error) => set({hint: {target, message, error}}),
    clearHint: () => set({hint: null}),

    // Feedback mode
    feedbackActivate: active =>
        set(state => ({feedback: {...state.feedback, active}})),
    feedbackAdd: item =>
        set(state => ({
            feedback: {
                ...state.feedback,
                items: {...state.feedback.items, [item.targetId]: item},
            },
        })),
    feedbackUpdate: (targetId, patch) =>
        set(state => {
            const existing = state.feedback.items[targetId];
            if (!existing) return {};
            return {
                feedback: {
                    ...state.feedback,
                    items: {...state.feedback.items, [targetId]: {...existing, ...patch}},
                },
            };
        }),
    feedbackRemove: targetId =>
        set(state => {
            if (!(targetId in state.feedback.items)) return {};
            const items = {...state.feedback.items};
            delete items[targetId];
            return {feedback: {...state.feedback, items}};
        }),
    feedbackReset: () => set(state => ({feedback: {...state.feedback, items: {}}})),
}));

// The collector's report reads the live store, so it answers with the language and
// dictionary the screen actually used, without importing the store itself (`D-625`).
setTranslationProvider(() => {
    const state = useAppStore.getState();
    return {language: state.language, dictionary: state.translations};
});
