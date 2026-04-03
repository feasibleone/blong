/**
 * Permission — conditionally renders children based on user permissions.
 */
import {type ReactNode} from 'react';
import {usePermission} from '../../hooks/usePermission.js';

interface IPermissionProps {
    permission?: string | boolean | null;
    fallback?: ReactNode;
    children: ReactNode;
}

export function Permission({permission, fallback = null, children}: IPermissionProps) {
    const allowed = usePermission(permission);
    return allowed ? <>{children}</> : <>{fallback}</>;
}
