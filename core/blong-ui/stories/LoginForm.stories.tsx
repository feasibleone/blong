/**
 * LoginForm Storybook stories.
 *
 * Demonstrates the LoginForm component in idle, loading, and error states
 * using a mock AuthContext.Provider to avoid real network calls.
 */

import React from 'react';
import type {Meta, StoryObj} from '@storybook/react-vite';
import {within, userEvent, expect} from '@storybook/test';

import {LoginForm} from '../src/auth/LoginForm.js';
import {AuthContext} from '../src/auth/AuthProvider.js';
import type {AuthContextValue} from '../src/auth/AuthProvider.js';

// ── Mock auth context values ──────────────────────────────────────────────────

const idleAuthValue: AuthContextValue = {
    isAuthenticated: false,
    isLoading: false,
    token: null,
    error: null,
    user: null,
    login: async (u: string, p: string) => {
        console.log('Login called', u, p);
    },
    logout: () => {},
};

const loadingAuthValue: AuthContextValue = {
    ...idleAuthValue,
    isLoading: true,
    // Never resolves — simulates an in-flight request
    login: async () => new Promise(() => {}),
};

const errorAuthValue: AuthContextValue = {
    ...idleAuthValue,
    error: 'Invalid username or password',
};

// ── Meta ──────────────────────────────────────────────────────────────────────

const meta: Meta<typeof LoginForm> = {
    title: 'Auth/LoginForm',
    component: LoginForm,
};

export default meta;
type Story = StoryObj<typeof LoginForm>;

// ── Stories ───────────────────────────────────────────────────────────────────

export const Default: Story = {
    name: 'Default (Idle)',
    decorators: [
        Story => (
            <AuthContext.Provider value={idleAuthValue}>
                <Story />
            </AuthContext.Provider>
        ),
    ],
    args: {
        title: 'Sign In',
        onSuccess: () => console.log('Login succeeded'),
    },
    play: async ({canvasElement}) => {
        const canvas = within(canvasElement);

        const usernameInput = canvas.getByLabelText('Username');
        const passwordInput = canvas.getByLabelText('Password');
        const signInButton = canvas.getByRole('button', {name: /sign in/i});

        await userEvent.type(usernameInput, 'alice');
        await userEvent.type(passwordInput, 'secret123');
        await userEvent.click(signInButton);

        await expect(usernameInput).toHaveValue('alice');
        await expect(passwordInput).toHaveValue('secret123');
    },
};

export const Submitting: Story = {
    name: 'Submitting (Loading)',
    decorators: [
        Story => (
            <AuthContext.Provider value={loadingAuthValue}>
                <Story />
            </AuthContext.Provider>
        ),
    ],
    args: {
        title: 'Sign In',
    },
};

export const WithError: Story = {
    name: 'With Error',
    decorators: [
        Story => (
            <AuthContext.Provider value={errorAuthValue}>
                <Story />
            </AuthContext.Provider>
        ),
    ],
    args: {
        title: 'Sign In',
    },
};
