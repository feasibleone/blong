/**
 * PortalMenu — portal menu from handler metadata.
 *
 * Generates the sidebar menu from component handler `title` and `permission`
 * properties via `portalMenuItem()`.
 */

import React from 'react';

import type {PortalConfig, PortalMenuItem} from '../types.js';
import {useRpcQuery} from '../hooks/useApi.js';
import {usePermissions} from '../hooks/usePermissions.js';

/** Props for the PortalMenu component. */
export interface PortalMenuProps {
    /** Method to call for portal params (default: 'portal.params.get'). */
    method?: string;
    /** Called when a menu item is clicked. */
    onNavigate: (path: string) => void;
    /** The current active path. */
    activePath?: string;
    /** CSS class name. */
    className?: string;
}

/**
 * Filter menu items by permission.
 */
function filterByPermission(
    items: PortalMenuItem[],
    hasPermission: (p?: string) => boolean,
): PortalMenuItem[] {
    return items
        .filter(item => hasPermission(item.permission))
        .map(item => ({
            ...item,
            items: item.items ? filterByPermission(item.items, hasPermission) : undefined,
        }));
}

function MenuItemComponent({
    item,
    activePath,
    onNavigate,
    depth = 0,
}: {
    item: PortalMenuItem;
    activePath?: string;
    onNavigate: (path: string) => void;
    depth?: number;
}): React.ReactElement {
    const hasChildren = item.items && item.items.length > 0;
    const isActive = activePath === item.to;

    return React.createElement(
        'li',
        {className: `blong-portal-menu-item blong-depth-${depth} ${isActive ? 'blong-active' : ''}`},
        React.createElement(
            'a',
            {
                href: item.to,
                onClick: (e: React.MouseEvent) => {
                    e.preventDefault();
                    if (item.to) onNavigate(item.to);
                },
                className: 'blong-portal-menu-link',
            },
            item.icon && React.createElement('span', {className: 'blong-menu-icon'}, item.icon),
            React.createElement('span', null, item.label),
        ),
        hasChildren &&
            React.createElement(
                'ul',
                {className: 'blong-portal-submenu'},
                ...item.items!.map(child =>
                    React.createElement(MenuItemComponent, {
                        key: child.to ?? child.label,
                        item: child,
                        activePath,
                        onNavigate,
                        depth: depth + 1,
                    }),
                ),
            ),
    );
}

/**
 * PortalMenu — renders the sidebar menu from server portal configuration.
 *
 * @example
 * ```tsx
 * <PortalMenu onNavigate={navigate} activePath={location.pathname} />
 * ```
 */
export function PortalMenu({
    method = 'portal.params.get',
    onNavigate,
    activePath,
    className = '',
}: PortalMenuProps): React.ReactElement {
    const {hasPermission} = usePermissions();
    const {data, isLoading} = useRpcQuery<PortalConfig>({
        method,
        staleTime: 10 * 60 * 1000,
    });

    if (isLoading) {
        return React.createElement(
            'nav',
            {className: `blong-portal-menu blong-portal-menu-loading ${className}`},
            React.createElement('div', {className: 'blong-skeleton'}),
        );
    }

    if (!data?.menu) {
        return React.createElement('nav', {className: `blong-portal-menu ${className}`});
    }

    const filteredMenu = filterByPermission(data.menu, hasPermission);

    return React.createElement(
        'nav',
        {className: `blong-portal-menu ${className}`},
        React.createElement(
            'ul',
            null,
            ...filteredMenu.map(item =>
                React.createElement(MenuItemComponent, {
                    key: item.to ?? item.label,
                    item,
                    activePath,
                    onNavigate,
                }),
            ),
        ),
    );
}
