/**
 * PageShell — application shell with sidebar navigation, breadcrumbs, header.
 *
 * Provides the standard layout for Blong browser applications.
 */

import React, {useState} from 'react';

import type {PortalConfig, PortalMenuItem} from '../types.js';
import {useAuth} from '../auth/AuthProvider.js';
import {useTheme} from '../hooks/useTheme.js';

/** Props for the PageShell component. */
export interface PageShellProps {
    /** Portal configuration (theme, menu, name). */
    portal?: PortalConfig;
    /** Breadcrumb items. */
    breadcrumbs?: Array<{label: string; to?: string}>;
    /** The main content. */
    children: React.ReactNode;
    /** Custom header content. */
    header?: React.ReactNode;
    /** Custom footer content. */
    footer?: React.ReactNode;
}

/**
 * Render a single menu item (recursive for nested items).
 */
function MenuItem({
    item,
    depth = 0,
}: {
    item: PortalMenuItem;
    depth?: number;
}): React.ReactElement {
    const [expanded, setExpanded] = useState(false);
    const hasChildren = item.items && item.items.length > 0;

    return React.createElement(
        'li',
        {className: `blong-menu-item blong-menu-depth-${depth}`},
        React.createElement(
            hasChildren ? 'button' : 'a',
            {
                className: 'blong-menu-link',
                href: hasChildren ? undefined : item.to,
                onClick: hasChildren ? () => setExpanded(!expanded) : undefined,
            },
            item.icon && React.createElement('span', {className: 'blong-menu-icon'}, item.icon),
            React.createElement('span', {className: 'blong-menu-label'}, item.label),
            hasChildren &&
                React.createElement('span', {className: 'blong-menu-arrow'}, expanded ? '▼' : '▶'),
        ),
        hasChildren &&
            expanded &&
            React.createElement(
                'ul',
                {className: 'blong-menu-submenu'},
                ...item.items!.map(child =>
                    React.createElement(MenuItem, {key: child.to ?? child.label, item: child, depth: depth + 1}),
                ),
            ),
    );
}

/**
 * PageShell component — app shell with navigation and content area.
 *
 * @example
 * ```tsx
 * <PageShell portal={portalConfig} breadcrumbs={[{label: 'Home'}, {label: 'Users'}]}>
 *     <UsersPage />
 * </PageShell>
 * ```
 */
export function PageShell({
    portal,
    breadcrumbs,
    children,
    header,
    footer,
}: PageShellProps): React.ReactElement {
    const {user, logout} = useAuth();
    const {isDark} = useTheme();
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

    const sidebarNav = portal?.menu
        ? React.createElement(
              'nav',
              {
                  className: `blong-sidebar ${sidebarCollapsed ? 'blong-sidebar-collapsed' : ''}`,
              },
              React.createElement(
                  'div',
                  {className: 'blong-sidebar-header'},
                  React.createElement(
                      'span',
                      {className: 'blong-portal-name'},
                      portal.portalName ?? 'Blong',
                  ),
                  React.createElement(
                      'button',
                      {
                          className: 'blong-sidebar-toggle',
                          onClick: () => setSidebarCollapsed(!sidebarCollapsed),
                      },
                      sidebarCollapsed ? '☰' : '✕',
                  ),
              ),
              React.createElement(
                  'ul',
                  {className: 'blong-menu'},
                  ...portal.menu.map(item =>
                      React.createElement(MenuItem, {key: item.to ?? item.label, item}),
                  ),
              ),
          )
        : null;

    const headerBar = React.createElement(
        'header',
        {className: 'blong-header'},
        header ?? React.createElement('div', {className: 'blong-header-spacer'}),
        React.createElement(
            'div',
            {className: 'blong-header-actions'},
            user &&
                React.createElement(
                    'span',
                    {className: 'blong-user-info'},
                    user.sub,
                ),
            user &&
                React.createElement(
                    'button',
                    {className: 'blong-btn blong-btn-logout', onClick: logout},
                    'Sign Out',
                ),
        ),
    );

    const breadcrumbNav = breadcrumbs?.length
        ? React.createElement(
              'nav',
              {className: 'blong-breadcrumbs', 'aria-label': 'Breadcrumb'},
              React.createElement(
                  'ol',
                  null,
                  ...breadcrumbs.map((crumb, idx) =>
                      React.createElement(
                          'li',
                          {key: idx},
                          crumb.to
                              ? React.createElement('a', {href: crumb.to}, crumb.label)
                              : React.createElement('span', null, crumb.label),
                      ),
                  ),
              ),
          )
        : null;

    return React.createElement(
        'div',
        {className: `blong-shell ${isDark ? 'blong-dark' : 'blong-light'}`},
        sidebarNav,
        React.createElement(
            'div',
            {className: 'blong-main'},
            headerBar,
            breadcrumbNav,
            React.createElement('main', {className: 'blong-content'}, children),
            footer && React.createElement('footer', {className: 'blong-footer'}, footer),
        ),
    );
}
