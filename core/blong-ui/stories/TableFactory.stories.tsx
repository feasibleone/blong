/**
 * TableCard Storybook stories.
 */

import React from 'react';
import type {Meta, StoryObj} from '@storybook/react-vite';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';

import {TableFactory} from '../src/factory/TableFactory.js';
import type {BlongSchema} from '../src/types.js';

const queryClient = new QueryClient({
    defaultOptions: {queries: {retry: false}},
});

// Sample response schema for a user list
const userListSchema: BlongSchema = {
    type: 'array',
    items: {
        type: 'object',
        properties: {
            userId: {
                type: 'integer',
                title: 'ID',
                'x-blong-order': 1,
                'x-blong-column': {width: '80px'},
            },
            userName: {
                type: 'string',
                title: 'Username',
                'x-blong-order': 2,
            },
            emailAddress: {
                type: 'string',
                title: 'Email',
                'x-blong-order': 3,
            },
            isActive: {
                type: 'boolean',
                title: 'Active',
                'x-blong-order': 4,
                'x-blong-column': {width: '100px'},
            },
            createdAt: {
                type: 'string',
                title: 'Created',
                format: 'date-time',
                'x-blong-order': 5,
            },
        },
    },
} as BlongSchema;

const sampleData = [
    {userId: 1, userName: 'alice', emailAddress: 'alice@example.com', isActive: true, createdAt: '2024-01-15'},
    {userId: 2, userName: 'bob', emailAddress: 'bob@example.com', isActive: true, createdAt: '2024-02-20'},
    {userId: 3, userName: 'charlie', emailAddress: 'charlie@example.com', isActive: false, createdAt: '2024-03-10'},
    {userId: 4, userName: 'diana', emailAddress: 'diana@example.com', isActive: true, createdAt: '2024-04-05'},
    {userId: 5, userName: 'eve', emailAddress: 'eve@example.com', isActive: true, createdAt: '2024-05-12'},
];

const meta: Meta<typeof TableFactory> = {
    title: 'Components/TableFactory',
    component: TableFactory,
    decorators: [
        (Story) => (
            <QueryClientProvider client={queryClient}>
                <Story />
            </QueryClientProvider>
        ),
    ],
};

export default meta;
type Story = StoryObj<typeof TableFactory>;

export const BasicTable: Story = {
    args: {
        schema: userListSchema,
        data: sampleData,
        totalRecords: sampleData.length,
    },
};

export const WithSelection: Story = {
    args: {
        schema: userListSchema,
        data: sampleData,
        totalRecords: sampleData.length,
        selectionMode: 'single',
        onSelectionChange: (sel) => console.log('Selected:', sel),
    },
};

export const Loading: Story = {
    args: {
        schema: userListSchema,
        data: [],
        isLoading: true,
    },
};

export const Paginated: Story = {
    args: {
        schema: userListSchema,
        data: sampleData.slice(0, 2),
        totalRecords: 50,
        pageSize: 2,
        pageNumber: 1,
    },
};
