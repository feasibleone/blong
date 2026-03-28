/**
 * AuthProvider — JWT authentication context using blong-login.
 *
 * Manages authentication state: login, logout, token refresh,
 * and provides the auth context to the component tree.
 */

import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
} from 'react';

import {getApiConfig, rpcCall, setApiConfig} from '../hooks/useApi.js';

/** Authentication state. */
export interface AuthState {
    /** Whether the user is authenticated. */
    isAuthenticated: boolean;
    /** Whether auth state is being loaded/checked. */
    isLoading: boolean;
    /** The current access token. */
    token: string | null;
    /** Login error message. */
    error: string | null;
    /** Decoded user information from the JWT. */
    user: AuthUser | null;
}

/** Decoded user information. */
export interface AuthUser {
    sub: string;
    permissions?: string[];
    roles?: string[];
    [key: string]: unknown;
}

/** Auth context methods. */
export interface AuthContextValue extends AuthState {
    /** Log in with credentials. */
    login: (username: string, password: string) => Promise<void>;
    /** Log out and clear tokens. */
    logout: () => void;
}

const defaultAuthContext: AuthContextValue = {
    isAuthenticated: false,
    isLoading: true,
    token: null,
    error: null,
    user: null,
    login: async () => {},
    logout: () => {},
};

export const AuthContext = createContext<AuthContextValue>(defaultAuthContext);

/** Decode the JWT payload. */
function decodeToken(token: string): AuthUser | null {
    try {
        const parts = token.split('.');
        if (parts.length !== 3) return null;
        return JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'))) as AuthUser;
    } catch {
        return null;
    }
}

/** Check if a token is expired. */
function isTokenExpired(token: string): boolean {
    const payload = decodeToken(token);
    if (!payload?.exp || typeof payload.exp !== 'number') return false;
    return payload.exp * 1000 < Date.now();
}

const TOKEN_KEY = 'blong_access_token';

/** Props for the AuthProvider component. */
export interface AuthProviderProps {
    children: React.ReactNode;
    /** Login RPC method (default: 'login.token.create'). */
    loginMethod?: string;
    /** Base URL for API calls. */
    baseUrl?: string;
}

/**
 * Authentication provider component.
 *
 * Wraps the application and provides JWT-based authentication via
 * the `blong-login` package's `login.token.create` endpoint.
 *
 * @example
 * ```tsx
 * <AuthProvider>
 *   <App />
 * </AuthProvider>
 * ```
 */
export function AuthProvider({
    children,
    loginMethod = 'login.token.create',
    baseUrl,
}: AuthProviderProps): React.ReactElement {
    const [state, setState] = useState<AuthState>({
        isAuthenticated: false,
        isLoading: true,
        token: null,
        error: null,
        user: null,
    });

    // Initialize from stored token
    useEffect(() => {
        if (baseUrl) {
            setApiConfig({baseUrl});
        }

        const storedToken = localStorage.getItem(TOKEN_KEY);
        if (storedToken && !isTokenExpired(storedToken)) {
            const user = decodeToken(storedToken);
            setApiConfig({token: storedToken});
            setState({
                isAuthenticated: true,
                isLoading: false,
                token: storedToken,
                error: null,
                user,
            });
        } else {
            if (storedToken) localStorage.removeItem(TOKEN_KEY);
            setState(prev => ({...prev, isLoading: false}));
        }
    }, [baseUrl]);

    const login = useCallback(
        async (username: string, password: string) => {
            setState(prev => ({...prev, isLoading: true, error: null}));
            try {
                // OAuth2 token response uses snake_case per RFC 6749
                const result = await rpcCall<{access_token: string}>(loginMethod, {
                    username,
                    password,
                });
                const token = result.access_token;
                const user = decodeToken(token);

                localStorage.setItem(TOKEN_KEY, token);
                setApiConfig({token});

                setState({
                    isAuthenticated: true,
                    isLoading: false,
                    token,
                    error: null,
                    user,
                });
            } catch (err) {
                const message = err instanceof Error ? err.message : 'Login failed';
                setState(prev => ({
                    ...prev,
                    isLoading: false,
                    error: message,
                    isAuthenticated: false,
                    token: null,
                    user: null,
                }));
            }
        },
        [loginMethod],
    );

    const logout = useCallback(() => {
        localStorage.removeItem(TOKEN_KEY);
        setApiConfig({token: undefined});
        setState({
            isAuthenticated: false,
            isLoading: false,
            token: null,
            error: null,
            user: null,
        });
    }, []);

    const contextValue = useMemo<AuthContextValue>(
        () => ({...state, login, logout}),
        [state, login, logout],
    );

    return (
        <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>
    );
}

/**
 * Hook to access the authentication context.
 */
export function useAuth(): AuthContextValue {
    return useContext(AuthContext);
}
