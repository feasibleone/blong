/**
 * ProtectedRoute — route guard that redirects to login when unauthenticated.
 */

import React from 'react';
import {Navigate, useLocation} from 'react-router-dom';

import {useAuth} from './AuthProvider.js';

/** Props for the ProtectedRoute component. */
export interface ProtectedRouteProps {
    children: React.ReactNode;
    /** Path to redirect to when not authenticated (default: '/login'). */
    loginPath?: string;
    /** Required permission to access this route. */
    permission?: string;
    /** Fallback to render while auth state is loading. */
    fallback?: React.ReactNode;
}

/**
 * Route guard component that checks authentication and optional permissions.
 *
 * @example
 * ```tsx
 * <Route path="/users" element={
 *   <ProtectedRoute permission="user.user.find">
 *     <UsersPage />
 *   </ProtectedRoute>
 * } />
 * ```
 */
export function ProtectedRoute({
    children,
    loginPath = '/login',
    permission,
    fallback = null,
}: ProtectedRouteProps): React.ReactElement | null {
    const {isAuthenticated, isLoading, user} = useAuth();
    const location = useLocation();

    if (isLoading) {
        return fallback as React.ReactElement | null;
    }

    if (!isAuthenticated) {
        return <Navigate to={loginPath} state={{from: location}} replace />;
    }

    // Check permission if required
    if (permission && user?.permissions && !user.permissions.includes(permission)) {
        return <Navigate to="/" replace />;
    }

    return children as React.ReactElement;
}
