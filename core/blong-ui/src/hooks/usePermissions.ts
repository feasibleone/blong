/**
 * usePermissions — permission checks from JWT claims.
 *
 * Decodes the JWT token to extract permission claims and provides
 * a `hasPermission` check for card/action gating.
 */

import {useCallback, useMemo} from 'react';

import {getApiConfig} from './useApi.js';

/** Decoded JWT payload with permission claims. */
interface JwtPayload {
    sub?: string;
    permissions?: string[];
    roles?: string[];
    exp?: number;
    iat?: number;
    [key: string]: unknown;
}

/**
 * Decode a JWT token payload (without signature verification — the server
 * has already verified the token; this is for UI display/gating only).
 *
 * **WARNING**: This decoding is NOT cryptographically verified. It must
 * NEVER be used for security-critical decisions. All authorization checks
 * must happen server-side. This is solely for UI display and conditional
 * rendering convenience.
 */
function decodeJwtPayload(token: string): JwtPayload | null {
    try {
        const parts = token.split('.');
        if (parts.length !== 3) return null;
        const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
        return payload as JwtPayload;
    } catch {
        return null;
    }
}

/**
 * Hook providing permission checks against the current JWT.
 *
 * @example
 * ```tsx
 * const { hasPermission, permissions } = usePermissions();
 * if (hasPermission('user.user.edit')) { ... }
 * ```
 */
export function usePermissions() {
    const config = getApiConfig();
    const payload = useMemo(
        () => (config.token ? decodeJwtPayload(config.token) : null),
        [config.token],
    );

    const permissions = useMemo(
        () => new Set(payload?.permissions ?? []),
        [payload],
    );

    const roles = useMemo(() => new Set(payload?.roles ?? []), [payload]);

    const hasPermission = useCallback(
        (permission: string | undefined): boolean => {
            if (!permission) return true; // No permission required
            return permissions.has(permission);
        },
        [permissions],
    );

    const hasRole = useCallback(
        (role: string): boolean => roles.has(role),
        [roles],
    );

    return {
        /** Check if the current user has a specific permission. */
        hasPermission,
        /** Check if the current user has a specific role. */
        hasRole,
        /** All permissions from the JWT. */
        permissions,
        /** All roles from the JWT. */
        roles,
        /** The decoded JWT subject. */
        subject: payload?.sub,
        /** Whether a valid token is present. */
        isAuthenticated: !!payload && (!payload.exp || payload.exp * 1000 > Date.now()),
    };
}
