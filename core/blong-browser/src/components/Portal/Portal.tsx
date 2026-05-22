/**
 * Portal — top-level application shell.
 *
 * Renders a Menubar at the top, a TabView of open pages below it,
 * and wires menu item clicks to action dispatches.
 */
import {Menubar, ProgressSpinner, TabPanel, TabView} from '../../primereact/index.js';
import './Portal.css';

import React, {Suspense, useCallback} from 'react';
import {useBlongUi} from '../../context/BlongUiContext.js';
import {usePortal} from '../../hooks/usePortal.js';
import testid from '../../lib/testid.js';
import {useAppStore} from '../../state/appStore.js';
import type {IPageAction} from '../../types/action.js';
import type {IMenuItem} from '../../types/portal.js';
import {Button} from '../Button/Button.js';
import {ErrorDialog} from '../Error/Error.js';
import {Hint} from '../Hint/Hint.js';
import {Loader} from '../Loader/Loader.js';
import {Text} from '../Text/Text.js';

// ── Per-tab error boundary ─────────────────────────────────────────────────

interface ITabErrorBoundaryState {
    error: Error | null;
}

class TabErrorBoundary extends React.Component<
    {children: React.ReactNode},
    ITabErrorBoundaryState
> {
    state: ITabErrorBoundaryState = {error: null};

    static getDerivedStateFromError(error: Error): ITabErrorBoundaryState {
        return {error};
    }

    render() {
        if (this.state.error) {
            return (
                <div className="blong-tab-error">
                    <i className="pi pi-exclamation-triangle blong-tab-error__icon" />
                    <p className="blong-tab-error__message">{this.state.error.message}</p>
                </div>
            );
        }
        return this.props.children;
    }
}

// ── Menu helpers ───────────────────────────────────────────────────────────

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
    const {dispatch} = useBlongUi();
    const openAction = useAppStore(s => s.openTab);
    const actions = useAppStore(s => s.actions);
    const updateTabComponent = useAppStore(s => s.updateTabComponent);

    const openByAction = useCallback(
        (actionName: string) => {
            const action = actions[actionName];
            const title = (action && 'title' in action ? action.title : null) ?? actionName;
            openAction({id: actionName, actionName, params: {}, title});

            // Resolve the component asynchronously
            void (async () => {
                try {
                    let component: React.ComponentType<Record<string, unknown>>;
                    if (action && 'component' in action) {
                        component = await (action as IPageAction).component({});
                    } else {
                        component = (await dispatch(
                            `component/${actionName}`,
                            {},
                        )) as React.ComponentType<Record<string, unknown>>;
                    }
                    if (component) updateTabComponent(actionName, component);
                } catch {
                    // Tab stays as loading spinner; dispatch may have shown an error already
                }
            })();
        },
        [actions, dispatch, openAction, updateTabComponent],
    );

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
                    renderActiveOnly={false}
                >
                    {tabs.map(tab => (
                        <TabPanel
                            __TYPE="TabPanel"
                            key={tab.id}
                            header={
                                <span
                                    className="blong-tab-header"
                                    {...testid(`portal.tab${tab.id}`)}
                                >
                                    {tab.dirty && <span className="blong-tab-dirty">● </span>}
                                    <Text>{tab.title}</Text>

                                    <Button
                                        icon="pi pi-times"
                                        className="p-button-text p-button-sm blong-tab-close p-0 vertical-align-baseline"
                                        onClick={e => {
                                            e.stopPropagation();
                                            closeTab(tab.id);
                                        }}
                                        {...testid(`portal.tab.close${tab.id}`)}
                                    />
                                </span>
                            }
                        >
                            {tab.component ? (
                                <TabErrorBoundary>
                                    <Suspense
                                        fallback={
                                            <div style={{padding: 32}}>
                                                <ProgressSpinner />
                                            </div>
                                        }
                                    >
                                        {React.createElement(
                                            tab.component as React.ComponentType<
                                                Record<string, unknown>
                                            >,
                                            {
                                                ...(tab.params as Record<string, unknown>),
                                                tabId: tab.id,
                                            },
                                        )}
                                    </Suspense>
                                </TabErrorBoundary>
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
