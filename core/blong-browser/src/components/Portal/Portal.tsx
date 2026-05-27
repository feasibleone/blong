/**
 * Portal — top-level application shell.
 *
 * Renders a Menubar at the top, a TabView of open pages below it,
 * and wires menu item clicks to action dispatches.
 */
import {
    Menubar,
    ProgressSpinner,
    TabPanel,
    TabView,
    type MenuItem,
} from '../../primereact/index.js';
import './Portal.css';

import React, {Suspense, useCallback} from 'react';
import {useBlong} from '../../context/BlongContext.js';
import {usePortal} from '../../hooks/usePortal.js';
import testid from '../../lib/testid.js';
import {useAppStore} from '../../state/appStore.js';
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

async function buildMenuModel(
    items: IMenuItem[] | undefined,
    command: MenuItem['command'],
    handler: ReturnType<typeof useBlong>['handler'],
): Promise<MenuItem[] | undefined> {
    if (!items) return undefined;
    return Promise.all(
        items.map(async item => {
            const action = typeof item === 'string' ? {method: item} : item;
            if ('items' in action) {
                return {
                    label: action.title,
                    icon: action.icon,
                    items: await buildMenuModel(action.items, command, handler),
                } as MenuItem;
            } else if ('method' in action) {
                const {title, permission, icon, component} = (await handler[
                    `component/${action.method}`
                ](typeof action.params === 'function' ? action.params({}) : (action.params as Record<string, unknown>) ?? {}, {})) as {
                    title: string;
                    permission?: string;
                    icon?: string;
                    component: React.ComponentType;
                };
                return {
                    label: title,
                    icon,
                    data: {
                        action: action.method,
                        params: action.params,
                        title,
                        permission,
                        component,
                    },
                    command,
                } as MenuItem;
            } else return {label: action.title, icon: action.icon};
        }),
    );
}

export interface IPortalProps {
    /** Logo component or element */
    logo?: React.ReactNode;
    /** Right side content for the menubar */
    menubarEnd?: React.ReactNode;
    className?: string;
}

export function Portal({logo, menubarEnd, className = ''}: IPortalProps) {
    const {tabs, activeTabId, setActiveTab, closeTab, portalConfig} = usePortal();
    const {handler} = useBlong();
    const openTab = useAppStore(s => s.openTab);

    const command = useCallback(
        ({
            item: {
                data: {component, title, action, params},
            },
        }: {
            item: MenuItem;
        }) => {
            void (async () => {
                try {
                    openTab({
                        id: `${action}?${JSON.stringify(params)}`,
                        actionName: action,
                        params,
                        title,
                        component: await component(),
                    });
                } catch {
                    // Tab stays as loading spinner; dispatch may have shown an error already
                }
            })();
        },
        [openTab],
    );

    const activeIndex = tabs.findIndex(t => t.id === activeTabId);
    const [menu, setMenu] = React.useState<MenuItem[] | undefined>(undefined);
    React.useEffect(() => {
        buildMenuModel(portalConfig?.menu, command, handler).then(setMenu);
    }, [portalConfig?.menu, command, handler]);

    const start =
        logo ??
        (portalConfig?.title ? (
            <span className="blong-portal-brand">{portalConfig.title}</span>
        ) : undefined);

    return (
        <div className={`blong-portal ${className}`}>
            <Loader />
            <Hint />
            <ErrorDialog />

            <Menubar
                start={start}
                end={menubarEnd}
                className="blong-portal-menubar"
                {...(menu && {model: menu})}
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
