/**
 * ReportCard Storybook stories.
 *
 * Demonstrates the filter-form + data-table report component.
 */

import React from 'react';
import type {Meta, StoryObj} from '@storybook/react-vite';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';

import {ReportCard} from '../src/components/ReportCard.js';
import type {BlongSchema} from '../src/types.js';

const queryClient = new QueryClient({
    defaultOptions: {queries: {retry: false}},
});

const tableSchema: BlongSchema = {
    type: 'object',
    properties: {
        transactionId: {type: 'string', title: 'Transaction ID', 'x-blong-order': 1},
        amount: {type: 'number', title: 'Amount', 'x-blong-order': 2},
        status: {type: 'string', title: 'Status', 'x-blong-order': 3},
        createdAt: {type: 'string', title: 'Created At', 'x-blong-order': 4},
    },
} as BlongSchema;

const filterSchema: BlongSchema = {
    type: 'object',
    properties: {
        dateFrom: {
            type: 'string',
            title: 'Date From',
            format: 'date',
            'x-blong-order': 1,
        },
        dateTo: {
            type: 'string',
            title: 'Date To',
            format: 'date',
            'x-blong-order': 2,
        },
        status: {
            type: 'string',
            title: 'Status',
            'x-blong-widget': 'select',
            'x-blong-order': 3,
        },
    },
} as BlongSchema;

const meta: Meta<typeof ReportCard> = {
    title: 'Components/ReportCard',
    component: ReportCard,
    decorators: [
        (Story) => (
            <QueryClientProvider client={queryClient}>
                <Story />
            </QueryClientProvider>
        ),
    ],
};

export default meta;
type Story = StoryObj<typeof ReportCard>;

export const Default: Story = {
    args: {
        schema: tableSchema,
        filterSchema,
        filterFields: ['dateFrom', 'dateTo', 'status'],
        fetchMethod: 'report.transaction.find',
        title: 'Transaction Report',
    },
};

export const NoFilters: Story = {
    args: {
        schema: tableSchema,
        fetchMethod: 'report.transaction.find',
        title: 'Transactions',
    },
};
