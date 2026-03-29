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
import {fakeJwt} from './helpers/fakeJwt.js';

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
