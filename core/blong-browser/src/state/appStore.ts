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
    language: string;
    actions: ActionRegistry;
    error: IBlongError | null;
    hint: IHint | null;
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
    updateTabComponent: (
        id: string,
        component: React.ComponentType<Record<string, unknown>>,
    ) => void;
    setMenuConfig: (config: IPortalConfig | null) => void;

    // Toasts
    showToast: (toast: Omit<IToast, 'id'>) => void;
    clearToast: (id: string) => void;
    clearAllToasts: () => void;

    // Loader
    setLoading: (active: boolean, message?: string) => void;

    // Translations
    setTranslations: (dict: TranslationDict) => void;
    setLanguage: (language: string) => void;

    // Actions registry
    registerActions: (actions: ActionRegistry) => void;

    // Error
    showError: (error: IBlongError) => void;
    clearError: () => void;

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
    menuConfig: null,
};

let toastIdCounter = 0;

export const useAppStore = create<IAppState & IAppActions>((set, get) => ({
    auth: initialAuth,
    portal: initialPortal,
    toasts: [],
    loader: {active: false, count: 0},
    translations: {},
    language: 'en',
    actions: {},
    error: null,
    hint: null,

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
    updateTabComponent: (id, component) =>
        set(state => ({
            portal: {
                ...state.portal,
                tabs: state.portal.tabs.map(t => (t.id === id ? {...t, component} : t)),
            },
        })),
    setMenuConfig: config => set(state => ({portal: {...state.portal, menuConfig: config}})),

    // Toast actions
    showToast: toast => {
        const id = String(++toastIdCounter);
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
    setLanguage: language => set({language}),

    // Actions registry
    registerActions: actions => set(state => ({actions: {...state.actions, ...actions}})),

    // Error
    showError: error => set({error}),
    clearError: () => set({error: null}),

    // Hint
    showHint: (target, message, error) => set({hint: {target, message, error}}),
    clearHint: () => set({hint: null}),
}));
