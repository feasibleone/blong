/**
 * Portal Storybook stories.
 * Full portal composition: AuthProvider + ThemeProvider + I18nProvider + PageShell.
 */
import React from 'react';
import type {Meta, StoryObj} from '@storybook/react-vite';
import {MemoryRouter} from 'react-router-dom';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';

import {AuthContext} from '../src/auth/AuthProvider.js';
import {ThemeProvider} from '../src/components/ThemeProvider.js';
import {I18nProvider} from '../src/components/I18nProvider.js';
import {PageShell} from '../src/components/PageShell.js';
import {TableFactory} from '../src/factory/TableFactory.js';
import {FormCard} from '../src/components/FormCard.js';
import {
    samplePortalConfig,
    userListSchema,
    userCards,
    userLayout,
    userSchema,
    sampleUsers,
} from './helpers/sampleSchemas.js';

const queryClient = new QueryClient({defaultOptions: {queries: {retry: false}}});

const mockAuthValue = {
    isAuthenticated: true,
    isLoading: false,
    token: null,
    error: null,
    user: {sub: 'alice', permissions: ['user.user.find', 'user.user.add']},
    login: async () => {},
    logout: () => {},
};

function FullPortal({children}: {children: React.ReactNode}) {
    return (
        <QueryClientProvider client={queryClient}>
            <MemoryRouter>
                <AuthContext.Provider value={mockAuthValue}>
                    <ThemeProvider initialMode="light">
                        <I18nProvider locale="en" translations={{}}>
                            <PageShell
                                portal={samplePortalConfig}
                                breadcrumbs={[{label: 'Home', to: '/'}, {label: 'Users'}]}
                            >
                                {children}
                            </PageShell>
                        </I18nProvider>
                    </ThemeProvider>
                </AuthContext.Provider>
            </MemoryRouter>
        </QueryClientProvider>
    );
}

const meta: Meta<typeof PageShell> = {
    title: 'Portal/FullPortal',
    component: PageShell,
};
export default meta;
type Story = StoryObj<typeof PageShell>;

export const Browse: Story = {
    render: () => (
        <FullPortal>
            <TableFactory
                schema={userListSchema}
                data={sampleUsers}
                totalRecords={sampleUsers.length}
            />
        </FullPortal>
    ),
};

export const Create: Story = {
    render: () => (
        <FullPortal>
            <FormCard
                schema={userSchema}
                cards={userCards}
                layout={userLayout}
                mode="create"
                title="Create User"
                onSubmit={async (data) => console.log('Create:', data)}
                onCancel={() => console.log('Cancel')}
            />
        </FullPortal>
    ),
};

export const Edit: Story = {
    render: () => (
        <FullPortal>
            <FormCard
                schema={userSchema}
                cards={userCards}
                layout={userLayout}
                mode="edit"
                title="Edit User"
                defaultValues={sampleUsers[0]}
                onSubmit={async (data) => console.log('Edit:', data)}
                onCancel={() => console.log('Cancel')}
            />
        </FullPortal>
    ),
};
