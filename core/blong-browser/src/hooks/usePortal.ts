/**
 * usePortal — access portal tabs and navigation.
 */
import {useCallback} from 'react';
import {useAppStore} from '../state/appStore.js';
import type {IPortalConfig, ITab} from '../types/portal.js';

export interface IUsePortalResult {
    tabs: ITab[];
    activeTabId: string | null;
    activeTab: ITab | undefined;
    menuConfig: IPortalConfig | null;
    openTab: (tab: ITab) => void;
    closeTab: (id: string) => void;
    setActiveTab: (id: string) => void;
    setTabDirty: (id: string, dirty: boolean) => void;
}

export function usePortal(): IUsePortalResult {
    const {tabs, activeTabId, menuConfig} = useAppStore(s => s.portal);
    const openTab = useAppStore(s => s.openTab);
    const closeTab = useAppStore(s => s.closeTab);
    const setActiveTab = useAppStore(s => s.setActiveTab);
    const setTabDirtyStore = useAppStore(s => s.setTabDirty);

    const activeTab = tabs.find(t => t.id === activeTabId);

    const setTabDirty = useCallback(
        (id: string, dirty: boolean) => setTabDirtyStore(id, dirty),
        [setTabDirtyStore],
    );

    return {tabs, activeTabId, activeTab, menuConfig, openTab, closeTab, setActiveTab, setTabDirty};
}
