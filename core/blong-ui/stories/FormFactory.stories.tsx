/**
 * FormFactory Storybook stories.
 *
 * Demonstrates the FormFactory component with various schemas,
 * modes, layouts, and configurations.
 */

import React from 'react';
import type {Meta, StoryObj} from '@storybook/react-vite';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';

import {FormFactory} from '../src/factory/FormFactory.js';
import {deriveCardsFromSchema} from '../src/factory/CardResolver.js';
import {deriveDefaultLayout, createTabbedLayout} from '../src/factory/LayoutResolver.js';
import type {BlongSchema, Cards, Layout} from '../src/types.js';

const queryClient = new QueryClient({
    defaultOptions: {queries: {retry: false}},
});

const contactSchema: BlongSchema = {
    type: 'object',
    required: ['firstName', 'emailAddress'],
    properties: {
        firstName: {type: 'string', title: 'First Name', 'x-blong-order': 1},
        lastName: {type: 'string', title: 'Last Name', 'x-blong-order': 2},
        emailAddress: {type: 'string', title: 'Email', format: 'email', 'x-blong-order': 3},
        phoneNumber: {type: 'string', title: 'Phone', 'x-blong-order': 4},
        notes: {type: 'string', title: 'Notes', maxLength: 500, 'x-blong-order': 5},
        isActive: {type: 'boolean', title: 'Active', 'x-blong-order': 6},
        age: {type: 'integer', title: 'Age', minimum: 0, maximum: 150, 'x-blong-order': 7},
    },
} as BlongSchema;

const contactCards: Cards = deriveCardsFromSchema(contactSchema);
const contactLayout: Layout = deriveDefaultLayout(contactCards);

const tabbedCards: Cards = {
    ...deriveCardsFromSchema({
        type: 'object',
        properties: {
            firstName: {type: 'string', title: 'First Name', 'x-blong-group': 'personal', 'x-blong-order': 1},
            lastName: {type: 'string', title: 'Last Name', 'x-blong-group': 'personal', 'x-blong-order': 2},
            emailAddress: {type: 'string', title: 'Email', 'x-blong-group': 'contact', 'x-blong-order': 1},
            phoneNumber: {type: 'string', title: 'Phone', 'x-blong-group': 'contact', 'x-blong-order': 2},
            notes: {type: 'string', title: 'Notes', maxLength: 500, 'x-blong-group': 'extra', 'x-blong-order': 1},
            isActive: {type: 'boolean', title: 'Active', 'x-blong-group': 'extra', 'x-blong-order': 2},
        },
    } as BlongSchema),
};

const tabbedLayout: Layout = createTabbedLayout([
    {label: 'Personal', cards: ['personal']},
    {label: 'Contact', cards: ['contact']},
    {label: 'Extra', cards: ['extra']},
]);

const nestedSchema: BlongSchema = {
    type: 'object',
    required: ['userName'],
    properties: {
        userName: {type: 'string', title: 'Username', 'x-blong-order': 1},
        emailAddress: {type: 'string', title: 'Email', 'x-blong-order': 2},
        street: {type: 'string', title: 'Street', 'x-blong-group': 'address', 'x-blong-order': 1},
        city: {type: 'string', title: 'City', 'x-blong-group': 'address', 'x-blong-order': 2},
        postalCode: {type: 'string', title: 'Postal Code', 'x-blong-group': 'address', 'x-blong-order': 3},
    },
} as BlongSchema;

const nestedCards: Cards = deriveCardsFromSchema(nestedSchema);
const nestedLayout: Layout = deriveDefaultLayout(nestedCards);

const meta: Meta<typeof FormFactory> = {
    title: 'Factory/FormFactory',
    component: FormFactory,
    decorators: [
        Story => (
            <QueryClientProvider client={queryClient}>
                <Story />
            </QueryClientProvider>
        ),
    ],
};

export default meta;
type Story = StoryObj<typeof FormFactory>;

export const BasicForm: Story = {
    args: {
        schema: contactSchema,
        cards: contactCards,
        layout: contactLayout,
        mode: 'create',
        onSubmit: async (data, mode) => console.log('Submit:', data, mode),
    },
};

export const EditForm: Story = {
    args: {
        schema: contactSchema,
        cards: contactCards,
        layout: contactLayout,
        mode: 'edit',
        defaultValues: {
            firstName: 'Jane',
            lastName: 'Doe',
            emailAddress: 'jane@example.com',
            phoneNumber: '555-1234',
            notes: 'VIP customer',
            isActive: true,
            age: 32,
        },
        onSubmit: async (data, mode) => console.log('Submit:', data, mode),
    },
};

export const TabbedForm: Story = {
    args: {
        schema: {
            type: 'object',
            required: ['firstName', 'emailAddress'],
            properties: {
                firstName: {type: 'string', title: 'First Name', 'x-blong-group': 'personal', 'x-blong-order': 1},
                lastName: {type: 'string', title: 'Last Name', 'x-blong-group': 'personal', 'x-blong-order': 2},
                emailAddress: {type: 'string', title: 'Email', 'x-blong-group': 'contact', 'x-blong-order': 1},
                phoneNumber: {type: 'string', title: 'Phone', 'x-blong-group': 'contact', 'x-blong-order': 2},
                notes: {type: 'string', title: 'Notes', maxLength: 500, 'x-blong-group': 'extra', 'x-blong-order': 1},
                isActive: {type: 'boolean', title: 'Active', 'x-blong-group': 'extra', 'x-blong-order': 2},
            },
        } as BlongSchema,
        cards: tabbedCards,
        layout: tabbedLayout,
        mode: 'create',
        onSubmit: async (data, mode) => console.log('Submit:', data, mode),
    },
};

export const LoadingForm: Story = {
    args: {
        schema: contactSchema,
        cards: contactCards,
        layout: contactLayout,
        mode: 'edit',
        isLoading: true,
        onSubmit: async (data, mode) => console.log('Submit:', data, mode),
    },
};

export const NestedObjectsForm: Story = {
    args: {
        schema: nestedSchema,
        cards: nestedCards,
        layout: nestedLayout,
        mode: 'create',
        onSubmit: async (data, mode) => console.log('Submit:', data, mode),
    },
};
