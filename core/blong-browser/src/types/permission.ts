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
    /**
     * The person's photograph: a `blob://` reference or an external URL (`@@D-842`).
     *
     * The account menu draws it in place of the initials, and the profile page sets it again after a
     * save, so a replaced photograph appears in the menubar without a reload.
     */
    photoUrl?: string;
    [key: string]: unknown;
}

/** Auth state */
export interface IAuthState {
    token: string | null;
    profile: IUserProfile | null;
    permissions: PermissionMap;
    isAuthenticated: boolean;
}
