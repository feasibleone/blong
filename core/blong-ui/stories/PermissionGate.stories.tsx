/**
 * PermissionGate Storybook stories.
 *
 * Demonstrates conditional rendering based on JWT permission claims.
 * Uses `setApiConfig` to inject a fake JWT before each story renders,
 * and restores the previous config on unmount to prevent state leaking
 * between stories.
 */

import React, {useEffect} from 'react';
import type {Meta, StoryObj} from '@storybook/react-vite';

import {PermissionGate} from '../src/components/PermissionGate.js';
import {setApiConfig, getApiConfig} from '../src/hooks/useApi.js';
import type {ApiConfig} from '../src/hooks/useApi.js';
import {fakeJwt} from './helpers/fakeJwt.js';

// ── Helper: scoped token decorator ───────────────────────────────────────────

/** Temporarily sets an API token for a story and restores previous on unmount. */
function WithToken({token, children}: {token: string; children: React.ReactNode}): React.ReactElement {
    useEffect(() => {
        const previous = getApiConfig();
        setApiConfig({token});
        return () => {
            setApiConfig(previous as ApiConfig);
        };
    }, [token]);
    return <>{children}</>;
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
    render: (args) => (
        <WithToken token={fakeJwt(['user.user.edit'])}>
            <PermissionGate {...args} />
        </WithToken>
    ),
    args: {
        permission: 'user.user.edit',
        children: <button>Edit User</button>,
        fallback: <span>Access Denied</span>,
    },
};

export const Denied: Story = {
    render: (args) => (
        <WithToken token={fakeJwt([])}>
            <PermissionGate {...args} />
        </WithToken>
    ),
    args: {
        permission: 'user.user.edit',
        children: <button>Edit User</button>,
        fallback: <span>Access Denied</span>,
    },
};

export const NoPermissionRequired: Story = {
    render: (args) => (
        <WithToken token={fakeJwt([])}>
            <PermissionGate {...args} />
        </WithToken>
    ),
    args: {
        children: <div>Always visible — no permission required.</div>,
    },
};
