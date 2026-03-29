/**
 * ProtectedRoute Storybook stories.
 *
 * Demonstrates ProtectedRoute with authenticated and unauthenticated auth
 * contexts, using MemoryRouter to satisfy react-router-dom requirements.
 */

import React from 'react';
import type {Meta, StoryObj} from '@storybook/react-vite';
import {MemoryRouter, Route, Routes} from 'react-router-dom';

import {ProtectedRoute} from '../src/auth/ProtectedRoute.js';
import {AuthContext} from '../src/auth/AuthProvider.js';
import type {AuthContextValue} from '../src/auth/AuthProvider.js';

// ── Mock auth context values ──────────────────────────────────────────────────

const authContextAuthenticated: AuthContextValue = {
    isAuthenticated: true,
    isLoading: false,
    token: 'mock-token',
    error: null,
    user: {sub: 'alice', permissions: ['user.user.find']},
    login: async () => {},
    logout: () => {},
};

const authContextUnauthenticated: AuthContextValue = {
    isAuthenticated: false,
    isLoading: false,
    token: null,
    error: null,
    user: null,
    login: async () => {},
    logout: () => {},
};

// ── Meta ──────────────────────────────────────────────────────────────────────

const meta: Meta<typeof ProtectedRoute> = {
    title: 'Auth/ProtectedRoute',
    component: ProtectedRoute,
};

export default meta;
type Story = StoryObj<typeof ProtectedRoute>;

// ── Stories ───────────────────────────────────────────────────────────────────

export const Allowed: Story = {
    name: 'Allowed',
    decorators: [
        () => (
            <MemoryRouter initialEntries={['/protected']}>
                <AuthContext.Provider value={authContextAuthenticated}>
                    <Routes>
                        <Route
                            path="/protected"
                            element={
                                <ProtectedRoute>
                                    <div style={{padding: '16px', fontFamily: 'monospace'}}>
                                        Protected Content
                                    </div>
                                </ProtectedRoute>
                            }
                        />
                    </Routes>
                </AuthContext.Provider>
            </MemoryRouter>
        ),
    ],
};

export const RedirectToLogin: Story = {
    name: 'Redirect To Login',
    decorators: [
        () => (
            <MemoryRouter initialEntries={['/protected']}>
                <AuthContext.Provider value={authContextUnauthenticated}>
                    <Routes>
                        <Route path="/login" element={<div style={{padding: '16px', fontFamily: 'monospace'}}>Login Page</div>} />
                        <Route
                            path="/protected"
                            element={
                                <ProtectedRoute>
                                    <div>Protected Content</div>
                                </ProtectedRoute>
                            }
                        />
                    </Routes>
                </AuthContext.Provider>
            </MemoryRouter>
        ),
    ],
};
