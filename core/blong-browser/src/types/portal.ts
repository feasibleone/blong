/**
 * Portal type definitions.
 * Portal manages tabs, navigation, and menu configuration.
 */

import type {IAction} from '@feasibleone/blong';
import type {TranslationDict} from '../state/appStore.js';

/** A single open tab in the portal */
export interface ITab {
    id: string;
    /** The action that opened this tab */
    /** The action name that opened this tab */
    actionName: string;
    /** Parameters that were passed to the action */
    params?: Record<string, unknown>;
    /** Resolved display title */
    title: string;
    /** Whether the tab has unsaved changes */
    dirty?: boolean;
    /** The loaded React component (after phase 2 resolution) */
    component?: React.ComponentType;
}
/** Menu item — can be a group or a leaf */
export type IMenuItem =
    | IAction
    | {
          title: string;
          permission?: string;
          icon?: string;
          items: IMenuItem[];
      };

/** Portal configuration YAML shape */
export interface IPortalConfig {
    name: string;
    title: string;
    theme?: string;
    home?: IAction;
    menu?: IMenuItem[];
    rightMenu?: IMenuItem[];
    /**
     * Self-service account profile wiring for the top-right account menu.
     * `page` is the component method that returns the profile page (e.g.
     * 'access.user.profile'), `get` the server method returning the caller's
     * own profile for the avatar (e.g. 'access.profile.get').
     */
    profile?: {
        page?: string;
        get?: string;
    };
    /**
     * Per-language translation dictionaries (English key → translated string).
     * Registered by the app so `setLanguage(language)` swaps the active table
     * to the matching language's dictionary.
     */
    translations?: Record<string, TranslationDict>;
    /**
     * UI languages offered by the menubar language switcher (ad-hoc switching).
     * Each entry is `{value, label}` where `value` matches a translation-
     * dictionary key.  When omitted, the switcher derives the list from the
     * keys of `translations` (and hides when fewer than two are available).
     */
    languages?: Array<{value: string; label: string}>;
}

/** Portal tab state managed by Zustand */
export interface IPortalState {
    tabs: ITab[];
    activeTabId: string | null;
    portalConfig: IPortalConfig | null;
}

/** Navigator node for hierarchical navigation */
export interface INavigatorNode {
    [key: string]: unknown;
    children?: INavigatorNode[];
}
