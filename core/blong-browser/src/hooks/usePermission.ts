/**
 * usePermission — check a single named permission.
 */
import {useAppStore} from '../state/appStore.js';

/**
 * Returns true if the current user has the given permission.
 * Also accepts a boolean override for testing.
 */
export function usePermission(permission: string | boolean | undefined | null): boolean {
    const permissions = useAppStore(s => s.auth.permissions);
    if (typeof permissions === 'boolean') return permissions;
    if (permission == null) return true;
    if (typeof permission === 'boolean') return permission;
    return permissions[permission] === true;
}
