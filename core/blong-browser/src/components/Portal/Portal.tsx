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
import {feedbackAttributes, portalFeedbackId} from '../../feedback/ids.js';
import {useFeedbackActive} from '../../feedback/useFeedbackTarget.js';
import {usePortal} from '../../hooks/usePortal.js';
import {useTranslate} from '../../hooks/useText.js';
import testid from '../../lib/testid.js';
import {useAppStore} from '../../state/appStore.js';
import type {IMenuItem, IPortalBrand, IPortalConfig} from '../../types/portal.js';
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
    t: (text: string | undefined) => string | undefined,
    feedback:
        | ((
              part: 'menu' | 'menuItem',
              id: string,
              label?: string,
          ) => Record<string, string> | undefined)
        | undefined,
): Promise<MenuItem[] | undefined> {
    if (!items) return undefined;
    return Promise.all(
        items.map(async item => {
            const action = typeof item === 'string' ? {method: item} : item;
            if ('items' in action) {
                // Derive a stable, language-independent group id from the first child method name.
                // e.g. items=['marine.coral.browse', ...] → groupId='marine'
                const firstChild = action.items?.find(
                    (i): i is string | {method: string} =>
                        typeof i === 'string' ||
                        (typeof i === 'object' && i !== null && 'method' in i),
                );
                const firstMethod =
                    typeof firstChild === 'string' ? firstChild : (firstChild?.method ?? '');
                const groupId = action.id ?? firstMethod.split('.')[0] ?? '';
                return {
                    label: t(action.title),
                    icon: action.icon,
                    items: await buildMenuModel(action.items, command, handler, t, feedback),
                    ...(groupId && {
                        template: (
                            item: MenuItem,
                            options: {
                                className: string;
                                labelClassName: string;
                                iconClassName: string;
                                onClick: (e: React.MouseEvent) => void;
                            },
                        ) => (
                            <a
                                className={options.className}
                                data-testid={`portal-menu-${groupId}`}
                                onClick={options.onClick}
                                {...feedback?.('menu', groupId, action.title)}
                            >
                                {item.icon && <span className={options.iconClassName} />}
                                <span className={options.labelClassName}>{item.label}</span>
                            </a>
                        ),
                    }),
                } as MenuItem;
            } else if ('method' in action) {
                const {title, permission, icon, component} = (await handler[
                    `component/${action.method}`
                ](
                    typeof action.params === 'function'
                        ? action.params({})
                        : ((action.params as Record<string, unknown>) ?? {}),
                    {},
                )) as {
                    title: string;
                    permission?: string;
                    icon?: string;
                    component: React.ComponentType;
                };
                const menuId = (action.method ?? '').replace(/\./g, '-');
                return {
                    label: t(title),
                    icon,
                    data: {
                        action: action.method,
                        params: action.params,
                        title,
                        permission,
                        component,
                    },
                    command,
                    template: (
                        item: MenuItem,
                        options: {
                            className: string;
                            labelClassName: string;
                            iconClassName: string;
                            onClick: (e: React.MouseEvent) => void;
                        },
                    ) => (
                        <a
                            className={options.className}
                            data-testid={`portal-menu-${menuId}`}
                            onClick={options.onClick}
                            {...feedback?.('menuItem', action.method ?? menuId, title)}
                        >
                            {item.icon && <span className={options.iconClassName} />}
                            <span className={options.labelClassName}>{item.label}</span>
                        </a>
                    ),
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
    // Group and leaf titles are PrimeReact labels, not JSX children, so they are
    // translated when the menu model is built (`D-625`).
    const t = useTranslate();
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
    // The menubar belongs to no realm, so its identifiers are `blong.portal.menu.*`
    // (`@@T-464`). Inert when the mode is off — the attributes are absent, not empty.
    const feedbackActive = useFeedbackActive();
    const feedbackTarget = useCallback(
        (part: 'menu' | 'menuItem', id: string, label?: string) =>
            feedbackActive
                ? feedbackAttributes(portalFeedbackId(part, id), part, label)
                : undefined,
        [feedbackActive],
    );
    React.useEffect(() => {
        buildMenuModel(portalConfig?.menu, command, handler, t, feedbackTarget).then(setMenu);
    }, [portalConfig?.menu, command, handler, t, feedbackTarget]);

    const brand = brandOf(portalConfig);
    const start =
        logo ??
        (portalConfig?.title || brand ? (
            <span className="blong-portal-brand">
                <BrandMark brand={brand} />
                {portalConfig?.title && (
                    // The brand name is a label: `Text` reads it from the active
                    // dictionary and falls back to the configured string, so a
                    // translation can rename the portal.
                    <Text className="blong-portal-brand-name">{portalConfig.title}</Text>
                )}
            </span>
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
                {tabs.length === 0 ? (
                    <PortalWelcome
                        brand={brand}
                        title={portalConfig?.title}
                    />
                ) : (
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
                                        {...(feedbackActive
                                            ? feedbackAttributes(
                                                  portalFeedbackId('tab', tab.id),
                                                  'tab',
                                                  tab.title,
                                              )
                                            : {})}
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
                )}
            </div>
        </div>
    );
}

/** The brand block of a portal config, if the merged config carries one. */
const brandOf = (portalConfig: IPortalConfig | null | undefined): IPortalBrand | undefined =>
    portalConfig?.brand;

/**
 * The brand mark at toolbar size.
 *
 * A logo image is capped by CSS (`--blong-portal-brand-height`) rather than by
 * an attribute: the menubar's height is its content's, so a mark that names a
 * pixel height grows the bar on a 200px file and shrinks it on a 16px one. The
 * fallback is a glyph, which costs nothing when a suite names neither.
 */
function BrandMark({brand}: {brand?: IPortalBrand}) {
    if (brand?.logoUrl) {
        return (
            <img
                className="blong-portal-brand-logo"
                src={brand.logoUrl}
                alt=""
                aria-hidden="true"
            />
        );
    }
    if (brand?.logoIcon) return <i className={`blong-portal-brand-icon ${brand.logoIcon}`} />;
    return null;
}

/**
 * What the portal shows while no page is open.
 *
 * The whitespace below the toolbar is the only room a portal has for the thing
 * it belongs to, so the brand is drawn there at full size: the logo, the portal
 * name and the organisation, centred. It renders only when the suite configured
 * a brand — a portal without one keeps the empty body it always had, which is
 * what leaves every existing screenshot unchanged.
 */
function PortalWelcome({brand, title}: {brand?: IPortalBrand; title?: string}) {
    if (!brand && !title) return null;
    return (
        <div className="blong-portal-welcome">
            <div className="blong-portal-welcome__brand">
                {brand?.logoUrl ? (
                    <img
                        className="blong-portal-welcome__logo"
                        src={brand.logoUrl}
                        alt=""
                        aria-hidden="true"
                    />
                ) : brand?.logoIcon ? (
                    <i className={`blong-portal-welcome__icon ${brand.logoIcon}`} />
                ) : null}
                {title && (
                    <Text
                        as="h1"
                        className="blong-portal-welcome__title"
                    >
                        {title}
                    </Text>
                )}
                {(brand?.orgLogoUrl || brand?.orgIcon || brand?.orgTitle) && (
                    <div className="blong-portal-welcome__org">
                        {brand.orgLogoUrl ? (
                            <img
                                className="blong-portal-welcome__org-logo"
                                src={brand.orgLogoUrl}
                                alt=""
                                aria-hidden="true"
                            />
                        ) : brand.orgIcon ? (
                            <i className={`blong-portal-welcome__org-icon ${brand.orgIcon}`} />
                        ) : null}
                        {brand.orgTitle && (
                            <Text className="blong-portal-welcome__org-name">{brand.orgTitle}</Text>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
