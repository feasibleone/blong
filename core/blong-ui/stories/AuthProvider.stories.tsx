/**
 * AuthProvider Storybook stories.
 *
 * Demonstrates the AuthProvider component and useAuth hook in authenticated
 * and unauthenticated states using localStorage-seeded fake JWTs.
 *
 * Each story uses a decorator that restores the original token value on
 * unmount to prevent localStorage leaking between stories.
 */

import React, {useEffect} from 'react';
import type {Meta, StoryObj} from '@storybook/react-vite';

import {AuthProvider, useAuth} from '../src/auth/AuthProvider.js';
import {fakeJwt} from './helpers/fakeJwt.js';

const TOKEN_KEY = 'blong_access_token';

// ── Demo component ────────────────────────────────────────────────────────────

function AuthStateDisplay(): React.ReactElement {
    const {isAuthenticated, user, logout, isLoading, error} = useAuth();
    return (
        <div style={{padding: '16px', fontFamily: 'monospace'}}>
            <p>isAuthenticated: <strong>{String(isAuthenticated)}</strong></p>
            <p>isLoading: <strong>{String(isLoading)}</strong></p>
            {user && <p>User: <strong>{user.sub}</strong></p>}
            {error && <p style={{color: 'red'}}>Error: {error}</p>}
            {isAuthenticated && <button onClick={logout}>Logout</button>}
        </div>
    );
}

/** Decorator that sets a token, renders children, and cleans up on unmount. */
function WithToken({token, children}: {token: string | null; children: React.ReactNode}): React.ReactElement {
    useEffect(() => {
        const previous = localStorage.getItem(TOKEN_KEY);
        if (token !== null) {
            localStorage.setItem(TOKEN_KEY, token);
        } else {
            localStorage.removeItem(TOKEN_KEY);
        }
        return () => {
            if (previous !== null) {
                localStorage.setItem(TOKEN_KEY, previous);
            } else {
                localStorage.removeItem(TOKEN_KEY);
            }
        };
    }, [token]);

    return <>{children}</>;
}

// ── Meta ──────────────────────────────────────────────────────────────────────

const meta: Meta<typeof AuthProvider> = {
    title: 'Auth/AuthProvider',
    component: AuthProvider,
};

export default meta;
type Story = StoryObj<typeof AuthProvider>;

// ── Stories ───────────────────────────────────────────────────────────────────

export const Authenticated: Story = {
    name: 'Authenticated',
    render: () => (
        <WithToken token={fakeJwt(['user.user.find'], 'alice')}>
            <AuthProvider>
                <AuthStateDisplay />
            </AuthProvider>
        </WithToken>
    ),
};

export const Unauthenticated: Story = {
    name: 'Unauthenticated',
    render: () => (
        <WithToken token={null}>
            <AuthProvider>
                <AuthStateDisplay />
            </AuthProvider>
        </WithToken>
    ),
};

export const ExpiredToken: Story = {
    name: 'Expired Token',
    render: () => (
        <WithToken token={fakeJwt(['user.user.find'], 'alice', -1)}>
            <AuthProvider>
                <AuthStateDisplay />
            </AuthProvider>
        </WithToken>
    ),
};
