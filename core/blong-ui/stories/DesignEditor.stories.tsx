/**
 * DesignEditor Storybook stories.
 */

import type {Meta, StoryObj} from '@storybook/react-vite';
import {expect, userEvent, within} from '@storybook/test';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import React from 'react';

import {DesignEditor} from '../src/design/DesignEditor.js';
import {FormFactory} from '../src/factory/FormFactory.js';
import type {BlongSchema, Cards, Layout} from '../src/types.js';

const queryClient = new QueryClient({
    defaultOptions: {queries: {retry: false}},
});

const schema: BlongSchema = {
    type: 'object',
    required: ['userName'],
    properties: {
        userName: {type: 'string', title: 'Username', 'x-blong-order': 1},
        emailAddress: {type: 'string', title: 'Email', 'x-blong-order': 2},
        firstName: {type: 'string', title: 'First Name', 'x-blong-order': 3},
        lastName: {type: 'string', title: 'Last Name', 'x-blong-order': 4},
        isActive: {type: 'boolean', title: 'Active', 'x-blong-order': 5},
    },
} as BlongSchema;

const cards: Cards = {
    account: {
        id: 'account',
        label: 'Account',
        widgets: ['userName', 'emailAddress'],
    },
    personal: {
        id: 'personal',
        label: 'Personal',
        widgets: ['firstName', 'lastName', 'isActive'],
    },
};

const layout: Layout = {
    cards: ['account', 'personal'],
};

const meta: Meta<typeof DesignEditor> = {
    title: 'Design/DesignEditor',
    component: DesignEditor,
    decorators: [
        Story => (
            <QueryClientProvider client={queryClient}>
                <Story />
            </QueryClientProvider>
        ),
    ],
};

export default meta;
type Story = StoryObj<typeof DesignEditor>;

export const Default: Story = {
    args: {
        schema,
        cards,
        layout,
        customisation: null,
        onSave: c => console.log('Save:', c),
        children: React.createElement(FormFactory, {
            schema,
            cards,
            layout,
            mode: 'edit',
            defaultValues: {userName: 'alice', emailAddress: 'alice@example.com'},
            onSubmit: async data => console.log('Submit:', data),
        }),
    },
    play: async ({canvasElement}) => {
        const canvas = within(canvasElement);

        // Enter design mode via the gear toggle button
        const enterBtn = canvas.getByTitle('Enter design mode');
        await expect(enterBtn).toBeVisible();
        await userEvent.click(enterBtn);

        // After toggle, Exit button should appear
        const exitBtn = canvas.getByTitle('Exit design mode');
        await expect(exitBtn).toBeVisible();

        // Exit design mode
        await userEvent.click(exitBtn);
        await expect(canvas.getByTitle('Enter design mode')).toBeVisible();
    },
};
