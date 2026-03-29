/**
 * AuthProvider Storybook stories.
 *
 * Demonstrates the AuthProvider component and useAuth hook in authenticated
 * and unauthenticated states using localStorage-seeded fake JWTs.
 */

import React from 'react';
import type {Meta, StoryObj} from '@storybook/react-vite';

import {AuthProvider, useAuth} from '../src/auth/AuthProvider.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeFakeToken(sub: string, permissions: string[]): string {
    const header = btoa(JSON.stringify({alg: 'HS256', typ: 'JWT'})).replace(/=/g, '');
    const payload = btoa(
        JSON.stringify({
            sub,
            permissions,
            exp: Math.floor(Date.now() / 1000) + 3600,
            iat: Math.floor(Date.now() / 1000),
        }),
    ).replace(/=/g, '');
    return `${header}.${payload}.fakesig`;
}

// ── Demo component ────────────────────────────────────────────────────────────

function AuthStateDisplay() {
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
    decorators: [
        () => {
            localStorage.setItem(
                'blong_access_token',
                makeFakeToken('alice', ['user.user.find']),
            );
            return (
                <AuthProvider>
                    <AuthStateDisplay />
                </AuthProvider>
            );
        },
    ],
};

export const Unauthenticated: Story = {
    name: 'Unauthenticated',
    decorators: [
        () => {
            localStorage.removeItem('blong_access_token');
            return (
                <AuthProvider>
                    <AuthStateDisplay />
                </AuthProvider>
            );
        },
    ],
};
