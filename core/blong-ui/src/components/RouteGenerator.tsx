/**
 * RouteGenerator — auto-generate React Router routes from page handlers.
 *
 * Page handlers follow the naming convention:
 * - `.browse` — collection view (table)
 * - `.new` — create form
 * - `.open` — edit form (with `{id}` parameter)
 */

import React from 'react';
import {Route, Routes} from 'react-router-dom';

import type {ComponentMeta, PortalMenuItem} from '../types.js';

/** A page handler definition for route generation. */
export interface PageHandler {
    /** Component ID following the semantic triple convention. */
    componentId: string;
    /** The React component to render. */
    component: React.ComponentType<Record<string, unknown>>;
    /** Page metadata. */
    meta: ComponentMeta;
    /** Page suffix: browse, new, open. */
    pageSuffix: 'browse' | 'new' | 'open';
}

/**
 * Derive the route path from a page handler component ID.
 *
 * Convention:
 * - `component$subject$entity.browse` → `/subject/entity`
 * - `component$subject$entity.new` → `/subject/entity/new`
 * - `component$subject$entity.open` → `/subject/entity/:id`
 */
export function deriveRoutePath(componentId: string, pageSuffix: string): string {
    // Strip the component$ prefix if present
    const cleanId = componentId.replace(/^component\$/, '');
    const parts = cleanId.split(/[\$\.]/);

    const basePath = `/${parts.join('/')}`;

    switch (pageSuffix) {
        case 'browse':
            return basePath;
        case 'new':
            return `${basePath}/new`;
        case 'open':
            return `${basePath}/:id`;
        default:
            return basePath;
    }
}

/**
 * Generate a portal menu item from a page handler.
 */
export function portalMenuItem(handler: PageHandler): PortalMenuItem {
    return {
        label: handler.meta.title,
        to: deriveRoutePath(handler.componentId, handler.pageSuffix),
        permission: handler.meta.permission,
    };
}

/** Props for the AutoRoutes component. */
export interface AutoRoutesProps {
    /** Page handler definitions. */
    pages: PageHandler[];
    /** Fallback component for unmatched routes. */
    fallback?: React.ReactNode;
}

/**
 * AutoRoutes — generates React Router Route elements from page handlers.
 *
 * @example
 * ```tsx
 * <AutoRoutes pages={discoveredPages} fallback={<NotFound />} />
 * ```
 */
export function AutoRoutes({pages, fallback}: AutoRoutesProps): React.ReactElement {
    return React.createElement(
        Routes,
        null,
        ...pages.map(page =>
            React.createElement(Route, {
                key: page.componentId,
                path: deriveRoutePath(page.componentId, page.pageSuffix),
                element: React.createElement(page.component),
            }),
        ),
        fallback &&
            React.createElement(Route, {
                path: '*',
                element: fallback,
            }),
    );
}
