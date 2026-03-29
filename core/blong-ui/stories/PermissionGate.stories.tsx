/**
 * PermissionGate Storybook stories.
 *
 * Demonstrates conditional rendering based on JWT permission claims.
 * Uses `setApiConfig` to inject a fake JWT before each story renders.
 */

import React from 'react';
import type {Meta, StoryObj} from '@storybook/react-vite';

import {PermissionGate} from '../src/components/PermissionGate.js';
import {setApiConfig} from '../src/hooks/useApi.js';

// ── JWT helper ────────────────────────────────────────────────────────────────

function toBase64Url(str: string): string {
    return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function fakeJwt(permissions: string[]): string {
    const header = toBase64Url(JSON.stringify({alg: 'HS256', typ: 'JWT'}));
    const payload = toBase64Url(
        JSON.stringify({
            sub: 'test-user',
            permissions,
            exp: Math.floor(Date.now() / 1000) + 3600,
        }),
    );
    return `${header}.${payload}.fakesig`;
}

// ── Meta ──────────────────────────────────────────────────────────────────────

const meta: Meta<typeof PermissionGate> = {
    title: 'Components/PermissionGate',
    component: PermissionGate,
};

export default meta;
type Story = StoryObj<typeof PermissionGate>;

// ── Stories ───────────────────────────────────────────────────────────────────

export const Allowed: Story = {
    decorators: [
        (Story) => {
            setApiConfig({token: fakeJwt(['user.user.edit'])});
            return <Story />;
        },
    ],
    args: {
        permission: 'user.user.edit',
        children: <button>Edit User</button>,
        fallback: <span>Access Denied</span>,
    },
};

export const Denied: Story = {
    decorators: [
        (Story) => {
            setApiConfig({token: fakeJwt([])});
            return <Story />;
        },
    ],
    args: {
        permission: 'user.user.edit',
        children: <button>Edit User</button>,
        fallback: <span>Access Denied</span>,
    },
};

export const NoPermissionRequired: Story = {
    decorators: [
        (Story) => {
            setApiConfig({token: fakeJwt([])});
            return <Story />;
        },
    ],
    args: {
        children: <div>Always visible — no permission required.</div>,
    },
};
