/**
 * Permission type definitions.
 */

/** Permission map — key is permission string, value is whether granted */
export type PermissionMap = Record<string, boolean> | boolean;

/** User profile shape */
export interface IUserProfile {
    actorId: string | number;
    name?: string;
    initials?: string;
    language?: string;
    [key: string]: unknown;
}

/** Auth state */
export interface IAuthState {
    token: string | null;
    profile: IUserProfile | null;
    permissions: PermissionMap;
    isAuthenticated: boolean;
}
