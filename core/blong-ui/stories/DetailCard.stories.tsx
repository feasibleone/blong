/**
 * DetailCard Storybook stories.
 *
 * Demonstrates the read-only entity display card with various configurations.
 */

import React from 'react';
import type {Meta, StoryObj} from '@storybook/react-vite';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';

import {DetailCard} from '../src/components/DetailCard.js';
import type {BlongSchema, Cards} from '../src/types.js';

const queryClient = new QueryClient({
    defaultOptions: {queries: {retry: false}},
});

const userSchema: BlongSchema = {
    type: 'object',
    properties: {
        userId: {type: 'integer', title: 'User ID', 'x-blong-order': 1},
        userName: {type: 'string', title: 'Username', 'x-blong-order': 2},
        emailAddress: {type: 'string', title: 'Email Address', 'x-blong-order': 3},
        firstName: {type: 'string', title: 'First Name', 'x-blong-order': 4},
        lastName: {type: 'string', title: 'Last Name', 'x-blong-order': 5},
        isActive: {type: 'boolean', title: 'Active', 'x-blong-order': 6},
    },
} as BlongSchema;

const userData = {
    userId: 42,
    userName: 'alice',
    emailAddress: 'alice@example.com',
    firstName: 'Alice',
    lastName: 'Smith',
    isActive: true,
};

const userCards: Cards = {
    account: {
        id: 'account',
        label: 'Account',
        widgets: ['userId', 'userName', 'emailAddress', 'isActive'],
    },
    personal: {
        id: 'personal',
        label: 'Personal Information',
        widgets: ['firstName', 'lastName'],
    },
};

const meta: Meta<typeof DetailCard> = {
    title: 'Components/DetailCard',
    component: DetailCard,
    decorators: [
        (Story) => (
            <QueryClientProvider client={queryClient}>
                <Story />
            </QueryClientProvider>
        ),
    ],
};

export default meta;
type Story = StoryObj<typeof DetailCard>;

export const Default: Story = {
    args: {
        schema: userSchema,
        data: userData,
        title: 'User Details',
    },
};

export const Loading: Story = {
    args: {
        schema: userSchema,
        data: {},
        title: 'Loading User...',
        isLoading: true,
    },
};

export const WithCards: Story = {
    args: {
        schema: userSchema,
        data: userData,
        cards: userCards,
        title: 'User Details',
    },
};
