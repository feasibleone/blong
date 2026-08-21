/**
 * Global application Zustand store.
 * Manages auth state, portal tabs, toasts, and loader.
 */
import type {ReactNode} from 'react';
import {create} from 'zustand';
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

/** Complete app state */
export interface IAppState {
    auth: IAuthState;
    portal: IPortalState;
    toasts: IToast[];
    loader: {active: boolean; message?: string; count: number};
    translations: TranslationDict;
    /**
     * Per-language dictionaries registered by the app via
     * `setTranslationsByLanguage`.  When non-empty, `setLanguage` swaps the
     * active `translations` table to the matching language's dictionary
     * (English falls back to an empty dict = English strings).
     */
    translationsByLanguage: Record<string, TranslationDict>;
    language: string;
    actions: ActionRegistry;
    error: IBlongError | null;
    hint: IHint | null;
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

    // Actions registry
    registerActions: (actions: ActionRegistry) => void;

    // Error
    showError: (error: IBlongError) => void;
    clearError: () => void;

    // Login prompt
    setLoginPrompt: (visible: boolean) => void;

    // Hint
    showHint: (target: HTMLElement | null, message: string, error: boolean) => void;
    clearHint: () => void;
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

export const useAppStore = create<IAppState & IAppActions>((set, get) => ({
    auth: initialAuth,
    portal: initialPortal,
    toasts: [],
    loader: {active: false, count: 0},
    translations: {},
    translationsByLanguage: {},
    language: 'en',
    actions: {},
    error: null,
    hint: null,
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
    setTranslations: dict => set({translations: dict}),
    setTranslationsByLanguage: dicts =>
        set(state => ({
            translationsByLanguage: dicts,
            // Re-apply the current language's dictionary immediately so the UI
            // reflects it even if the language was set before the dicts loaded.
            translations:
                Object.keys(dicts).length > 0
                    ? (dicts[state.language] ?? {})
                    : state.translations,
        })),
    setLanguage: language =>
        set(state => ({
            language,
            // When the app registered per-language dictionaries, switching the
            // language also swaps the active translation table (English = {}).
            translations:
                Object.keys(state.translationsByLanguage).length > 0
                    ? (state.translationsByLanguage[language] ?? {})
                    : state.translations,
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

    // Login prompt
    setLoginPrompt: visible => set({loginPrompt: visible}),

    // Hint
    showHint: (target, message, error) => set({hint: {target, message, error}}),
    clearHint: () => set({hint: null}),
}));
