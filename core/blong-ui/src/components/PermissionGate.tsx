/**
 * PermissionGate — conditionally render content based on JWT permissions.
 *
 * Cards and actions can be gated via the `permission` prop.
 */

import React from 'react';

import {usePermissions} from '../hooks/usePermissions.js';

/** Props for the PermissionGate component. */
export interface PermissionGateProps {
    /** Required permission string. If undefined, always renders. */
    permission?: string;
    /** Content to render when permission is granted. */
    children: React.ReactNode;
    /** Fallback content when permission is denied (default: null). */
    fallback?: React.ReactNode;
}

/**
 * PermissionGate — conditionally renders children based on permission.
 *
 * @example
 * ```tsx
 * <PermissionGate permission="user.user.edit">
 *     <EditButton />
 * </PermissionGate>
 * ```
 */
export function PermissionGate({
    permission,
    children,
    fallback = null,
}: PermissionGateProps): React.ReactElement | null {
    const {hasPermission} = usePermissions();

    if (!hasPermission(permission)) {
        return fallback as React.ReactElement | null;
    }

    return children as React.ReactElement;
}

/**
 * usePermissionCheck — hook variant of PermissionGate.
 *
 * @example
 * ```tsx
 * const canEdit = usePermissionCheck('user.user.edit');
 * ```
 */
export function usePermissionCheck(permission?: string): boolean {
    const {hasPermission} = usePermissions();
    return hasPermission(permission);
}
