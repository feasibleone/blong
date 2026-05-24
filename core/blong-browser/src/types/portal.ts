/**
 * Portal type definitions.
 * Portal manages tabs, navigation, and menu configuration.
 */

import type {IAction} from '@feasibleone/blong';

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
