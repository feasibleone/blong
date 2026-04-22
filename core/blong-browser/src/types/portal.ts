/**
 * Portal type definitions.
 * Portal manages tabs, navigation, and menu configuration.
 */

/** A single open tab in the portal */
export interface ITab {
    id: string;
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
export interface IMenuItem {
    title?: string;
    /** Action name for leaf items */
    action?: string;
    icon?: string;
    items?: IMenuItem[];
}

/** Portal configuration YAML shape */
export interface IPortalConfig {
    name: string;
    title: string;
    theme?: string;
    /** Action name for the home (default) page */
    home?: string;
    menu?: IMenuItem[];
    rightMenu?: string[];
}

/** Portal tab state managed by Zustand */
export interface IPortalState {
    tabs: ITab[];
    activeTabId: string | null;
    menuConfig: IPortalConfig | null;
}

/** Navigator node for hierarchical navigation */
export interface INavigatorNode {
    [key: string]: unknown;
    children?: INavigatorNode[];
}
