/**
 * PageShell Storybook stories.
 */

import React from 'react';
import type {Meta, StoryObj} from '@storybook/react-vite';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {MemoryRouter} from 'react-router-dom';

import {PageShell} from '../src/components/PageShell.js';
import {AuthContext} from '../src/auth/AuthProvider.js';
import {ThemeContext} from '../src/hooks/useTheme.js';
import type {PortalConfig} from '../src/types.js';

const queryClient = new QueryClient({
    defaultOptions: {queries: {retry: false}},
});

const mockAuthValue = {
    isAuthenticated: true,
    isLoading: false,
    token: 'mock',
    error: null,
    user: {sub: 'alice'},
    login: async () => {},
    logout: () => {},
};

const mockThemeValue = {
    mode: 'light' as const,
    setMode: () => {},
    isDark: false,
    themeName: 'lara-light',
    setThemeName: () => {},
    availableThemes: ['lara-light', 'lara-dark'],
};

const samplePortal: PortalConfig = {
    portalName: 'Demo Portal',
    menu: [
        {label: 'Dashboard', to: '/', icon: '🏠'},
        {
            label: 'Users',
            to: '/users',
            icon: '👥',
            items: [
                {label: 'User List', to: '/users'},
                {label: 'Create User', to: '/users/new'},
            ],
        },
        {label: 'Reports', to: '/reports', icon: '📊'},
    ],
};

const meta: Meta<typeof PageShell> = {
    title: 'Components/PageShell',
    component: PageShell,
    decorators: [
        (Story) => (
            <QueryClientProvider client={queryClient}>
                <AuthContext.Provider value={mockAuthValue}>
                    <ThemeContext.Provider value={mockThemeValue}>
                        <MemoryRouter>
                            <Story />
                        </MemoryRouter>
                    </ThemeContext.Provider>
                </AuthContext.Provider>
            </QueryClientProvider>
        ),
    ],
};

export default meta;
type Story = StoryObj<typeof PageShell>;

export const WithMenu: Story = {
    args: {
        portal: samplePortal,
        children: <div style={{padding: '1rem'}}>Main content area</div>,
    },
};

export const WithBreadcrumbs: Story = {
    args: {
        portal: samplePortal,
        breadcrumbs: [
            {label: 'Home', to: '/'},
            {label: 'Users', to: '/users'},
            {label: 'Alice'},
        ],
        children: <div style={{padding: '1rem'}}>User detail content</div>,
    },
};

export const Minimal: Story = {
    args: {
        children: <div style={{padding: '1rem'}}>Minimal shell — no menu, no breadcrumbs</div>,
    },
};
