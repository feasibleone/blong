/**
 * Portal — top-level application shell.
 *
 * Renders a Menubar at the top, a TabView of open pages below it,
 * and wires menu item clicks to action dispatches.
 */
import {Menubar, ProgressSpinner, TabPanel, TabView} from '../../primereact/index.js';



import React, {Suspense} from 'react';
import {usePortal} from '../../hooks/usePortal.js';
import {useAppStore} from '../../state/appStore.js';
import type {IMenuItem} from '../../types/portal.js';
import {Button} from '../Button/index.js';
import {ErrorDialog} from '../Error/index.js';
import {Hint} from '../Hint/index.js';
import {Loader} from '../Loader/index.js';

function buildMenuModel(items: IMenuItem[], openAction: (actionName: string) => void): object[] {
    return items.map(item => {
        if (item.items?.length) {
            return {
                label: item.title,
                icon: item.icon,
                items: buildMenuModel(item.items, openAction),
            };
        }
        return {
            label: item.title,
            icon: item.icon,
            command: () => {
                if (item.action) openAction(item.action);
            },
        };
    });
}

export interface IPortalProps {
    /** Logo component or element */
    logo?: React.ReactNode;
    /** Right side content for the menubar */
    menubarEnd?: React.ReactNode;
    className?: string;
}

export function Portal({logo, menubarEnd, className = ''}: IPortalProps) {
    const {tabs, activeTabId, setActiveTab, closeTab, menuConfig} = usePortal();
    const openAction = useAppStore(s => s.openTab);
    const openByAction = (actionName: string) => {
        // Tab deduplication is handled by openTab in appStore
        // Here we look up registered action but can work with the name too
        openAction({
            id: actionName, // openTab deduplicates by actionName
            actionName,
            params: {},
            title: actionName,
        });
    };

    const activeIndex = tabs.findIndex(t => t.id === activeTabId);
    const menuModel = menuConfig?.menu ? buildMenuModel(menuConfig.menu, openByAction) : [];

    const start =
        logo ??
        (menuConfig?.title ? (
            <span className="blong-portal-brand">{menuConfig.title}</span>
        ) : undefined);

    return (
        <div className={`blong-portal ${className}`}>
            <Loader />
            <Hint />
            <ErrorDialog />

            <Menubar
                model={menuModel}
                start={start}
                end={menubarEnd}
                className="blong-portal-menubar"
            />

            <div className="blong-portal-body">
                <TabView
                    activeIndex={activeIndex >= 0 ? activeIndex : 0}
                    onTabChange={e => setActiveTab(tabs[e.index]?.id ?? null)}
                    scrollable
                    className="blong-portal-tabs"
                >
                    {tabs.map(tab => (
                        <TabPanel
                            key={tab.id}
                            header={
                                <span className="blong-tab-header">
                                    {tab.dirty && <span className="blong-tab-dirty">●</span>}
                                    {tab.title}
                                    <Button
                                        icon="pi pi-times"
                                        className="p-button-text p-button-sm blong-tab-close"
                                        onClick={e => {
                                            e.stopPropagation();
                                            closeTab(tab.id);
                                        }}
                                    />
                                </span>
                            }
                        >
                            {tab.component ? (
                                <Suspense
                                    fallback={
                                        <div style={{padding: 32}}>
                                            <ProgressSpinner />
                                        </div>
                                    }
                                >
                                    <tab.component {...tab.params} />
                                </Suspense>
                            ) : (
                                <div className="blong-portal-loading">
                                    <ProgressSpinner />
                                </div>
                            )}
                        </TabPanel>
                    ))}
                </TabView>
            </div>
        </div>
    );
}
