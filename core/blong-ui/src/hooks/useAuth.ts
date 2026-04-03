/**
 * useAuth — access authentication state and actions.
 */
import {useAppStore} from '../state/appStore.js';
import type {IAuthState} from '../types/permission.js';

export interface IUseAuthResult extends IAuthState {
    logout: () => void;
    setToken: (token: string | null) => void;
}

export function useAuth(): IUseAuthResult {
    const auth = useAppStore(s => s.auth);
    const logout = useAppStore(s => s.logout);
    const setToken = useAppStore(s => s.setToken);
    return {...auth, logout, setToken};
}
