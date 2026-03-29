/**
 * PortalMenu Storybook stories.
 */

import React, {useState} from 'react';
import type {Meta, StoryObj} from '@storybook/react-vite';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';

import {PortalMenu} from '../src/components/PortalMenu.js';
import type {PortalConfig} from '../src/types.js';

const portalData: PortalConfig = {
    portalName: 'Demo',
    menu: [
        {label: 'Home', to: '/', icon: '🏠'},
        {
            label: 'Users',
            to: '/users',
            icon: '👥',
            items: [
                {label: 'List', to: '/users'},
                {label: 'Add', to: '/users/new'},
            ],
        },
        {label: 'Reports', to: '/reports', icon: '📊'},
    ],
};

const portalDataNested: PortalConfig = {
    portalName: 'Demo',
    menu: [
        {label: 'Home', to: '/', icon: '🏠'},
        {
            label: 'Administration',
            to: '/admin',
            icon: '⚙️',
            items: [
                {
                    label: 'Users',
                    to: '/admin/users',
                    icon: '👥',
                    items: [
                        {label: 'All Users', to: '/admin/users'},
                        {label: 'Roles', to: '/admin/users/roles'},
                    ],
                },
                {label: 'Settings', to: '/admin/settings', icon: '🔧'},
            ],
        },
        {label: 'Reports', to: '/reports', icon: '📊'},
    ],
};

function makeQueryClient(data?: PortalConfig) {
    const qc = new QueryClient({defaultOptions: {queries: {retry: false}}});
    if (data) {
        qc.setQueryData(['portal.params.get', undefined], data);
    }
    return qc;
}

function PortalMenuWrapper({
    queryClient,
    activePath,
}: {
    queryClient: QueryClient;
    activePath?: string;
}) {
    const [currentPath, setCurrentPath] = useState(activePath ?? '/');
    return (
        <QueryClientProvider client={queryClient}>
            <div style={{width: '240px', border: '1px solid #e0e0e0', borderRadius: '4px'}}>
                <PortalMenu
                    onNavigate={(path) => {
                        console.log('Navigate to:', path);
                        setCurrentPath(path);
                    }}
                    activePath={currentPath}
                />
            </div>
        </QueryClientProvider>
    );
}

const loadedQueryClient = makeQueryClient(portalData);
const nestedQueryClient = makeQueryClient(portalDataNested);
const emptyQueryClient = makeQueryClient();

const meta: Meta<typeof PortalMenu> = {
    title: 'Components/PortalMenu',
    component: PortalMenu,
};

export default meta;
type Story = StoryObj<typeof PortalMenu>;

export const Loaded: Story = {
    render: () => <PortalMenuWrapper queryClient={loadedQueryClient} activePath="/" />,
};

export const Loading: Story = {
    render: () => <PortalMenuWrapper queryClient={emptyQueryClient} />,
};

export const NestedItems: Story = {
    render: () => <PortalMenuWrapper queryClient={nestedQueryClient} activePath="/admin/users" />,
};
