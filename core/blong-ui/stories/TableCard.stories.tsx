/**
 * TableCard Storybook stories.
 *
 * TableCard requires a live JSON-RPC `fetchMethod` and does not accept static
 * `data` directly. Stories use TableFactory with static data to demonstrate
 * the visual states, and a mocked-fetch story to show TableCard itself.
 */

import React from 'react';
import type {Meta, StoryObj} from '@storybook/react-vite';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';

import {TableCard} from '../src/components/TableCard.js';
import {TableFactory} from '../src/factory/TableFactory.js';
import type {BlongSchema} from '../src/types.js';

const queryClient = new QueryClient({
    defaultOptions: {queries: {retry: false, staleTime: Infinity}},
});

// ── Schema ────────────────────────────────────────────────────────────────────

const userListSchema: BlongSchema = {
    type: 'array',
    items: {
        type: 'object',
        properties: {
            userId: {
                type: 'integer',
                title: 'ID',
                'x-blong-order': 1,
                'x-blong-column': {width: '80px', sortable: true},
            },
            userName: {type: 'string', title: 'Username', 'x-blong-order': 2},
            emailAddress: {type: 'string', title: 'Email', 'x-blong-order': 3},
            isActive: {type: 'boolean', title: 'Active', 'x-blong-order': 4},
            createdAt: {type: 'string', title: 'Created', format: 'date', 'x-blong-order': 5},
        },
    },
} as BlongSchema;

const sampleUsers = [
    {userId: 1, userName: 'alice', emailAddress: 'alice@example.com', isActive: true, createdAt: '2024-01-15'},
    {userId: 2, userName: 'bob', emailAddress: 'bob@example.com', isActive: true, createdAt: '2024-02-20'},
    {userId: 3, userName: 'charlie', emailAddress: 'charlie@example.com', isActive: false, createdAt: '2024-03-10'},
    {userId: 4, userName: 'diana', emailAddress: 'diana@example.com', isActive: true, createdAt: '2024-04-05'},
    {userId: 5, userName: 'eve', emailAddress: 'eve@example.com', isActive: false, createdAt: '2024-05-18'},
];

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Wraps children in the QueryClientProvider required by TableCard. */
function Wrapper({children}: {children: React.ReactNode}) {
    return (
        <QueryClientProvider client={queryClient}>
            {children}
        </QueryClientProvider>
    );
}

/** Patches globalThis.fetch to return mock JSON-RPC responses. */
function withMockFetch(method: string, response: unknown) {
    const original = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url;
        if (url.includes('/rpc/')) {
            const body = init?.body ? JSON.parse(String(init.body)) : {};
            if (body.method === method) {
                return new Response(
                    JSON.stringify({jsonrpc: '2.0', result: response, id: body.id}),
                    {status: 200, headers: {'Content-Type': 'application/json'}},
                );
            }
        }
        return original(input, init);
    };
}

// ── Meta ──────────────────────────────────────────────────────────────────────

const meta: Meta<typeof TableCard> = {
    title: 'Components/TableCard',
    component: TableCard,
    decorators: [
        Story => (
            <Wrapper>
                <Story />
            </Wrapper>
        ),
    ],
};
export default meta;
type Story = StoryObj<typeof TableCard>;

// ── Static stories via TableFactory ──────────────────────────────────────────

/**
 * Populated table — renders TableFactory directly with static data.
 * Use this as a visual reference; no network call is made.
 */
export const Populated: Story = {
    render: () => (
        <Wrapper>
            <div className="blong-table-card">
                <TableFactory
                    schema={userListSchema}
                    data={sampleUsers}
                    totalRecords={sampleUsers.length}
                    pageSize={20}
                    pageNumber={1}
                />
            </div>
        </Wrapper>
    ),
};

/** Empty state — no rows. */
export const Empty: Story = {
    render: () => (
        <Wrapper>
            <div className="blong-table-card">
                <TableFactory
                    schema={userListSchema}
                    data={[]}
                    totalRecords={0}
                    pageSize={20}
                    pageNumber={1}
                />
            </div>
        </Wrapper>
    ),
};

/** Loading state — spinner shown while data is being fetched. */
export const Loading: Story = {
    render: () => (
        <Wrapper>
            <div className="blong-table-card">
                <TableFactory
                    schema={userListSchema}
                    data={[]}
                    totalRecords={0}
                    pageSize={20}
                    pageNumber={1}
                    isLoading={true}
                />
            </div>
        </Wrapper>
    ),
};

// ── Live TableCard with mocked fetch ─────────────────────────────────────────

/**
 * TableCard with mocked RPC fetch.
 * Patches fetch before the story renders so the component's internal
 * `useRpcFetch` hook receives a valid paginated response.
 */
export const WithMockedFetch: Story = {
    render: () => {
        withMockFetch('user.user.find', {
            items: sampleUsers,
            pagination: {recordsTotal: sampleUsers.length, pageSize: 20, pageNumber: 1},
        });
        return (
            <TableCard
                schema={userListSchema}
                fetchMethod="user.user.find"
                title="Users"
                pageSize={20}
                selectionMode="single"
                onRowOpen={(row) => console.log('Open row:', row)}
            />
        );
    },
};

/** TableCard showing search toolbar with row-open callback. */
export const WithRowOpen: Story = {
    render: () => {
        withMockFetch('user.user.find', {
            items: sampleUsers,
            pagination: {recordsTotal: sampleUsers.length, pageSize: 20, pageNumber: 1},
        });
        return (
            <TableCard
                schema={userListSchema}
                fetchMethod="user.user.find"
                title="Select a User"
                selectionMode="single"
                onSelectionChange={(sel) => console.log('Selected:', sel)}
                onRowOpen={(row) => console.log('Navigate to:', row.userId)}
            />
        );
    },
};
