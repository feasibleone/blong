/**
 * FormCard Storybook stories.
 *
 * Demonstrates the FormCard component with various schemas and configurations.
 */

import type {Meta, StoryObj} from '@storybook/react-vite';
import {expect, userEvent, within} from '@storybook/test';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';

import {FormCard} from '../src/components/FormCard.js';
import type {BlongSchema, Cards, Layout} from '../src/types.js';

const queryClient = new QueryClient({
    defaultOptions: {queries: {retry: false}},
});

// Sample schema for a user entity
const userSchema: BlongSchema = {
    type: 'object',
    required: ['userName', 'emailAddress'],
    properties: {
        userName: {
            type: 'string',
            title: 'Username',
            maxLength: 50,
            'x-blong-order': 1,
        },
        emailAddress: {
            type: 'string',
            title: 'Email Address',
            format: 'email',
            'x-blong-order': 2,
        },
        firstName: {
            type: 'string',
            title: 'First Name',
            'x-blong-order': 3,
            'x-blong-group': 'personal',
        },
        lastName: {
            type: 'string',
            title: 'Last Name',
            'x-blong-order': 4,
            'x-blong-group': 'personal',
        },
        isActive: {
            type: 'boolean',
            title: 'Active',
            'x-blong-order': 5,
        },
        roleId: {
            type: 'integer',
            title: 'Role',
            'x-blong-widget': 'dropdown',
            'x-blong-lookup': 'role',
            'x-blong-order': 6,
        },
        notes: {
            type: 'string',
            title: 'Notes',
            maxLength: 1000,
            'x-blong-widget': 'text',
            'x-blong-order': 7,
            'x-blong-group': 'additional',
        },
    },
} as BlongSchema;

const userCards: Cards = {
    account: {
        id: 'account',
        label: 'Account',
        widgets: ['userName', 'emailAddress', 'isActive', 'roleId'],
    },
    personal: {
        id: 'personal',
        label: 'Personal Information',
        widgets: ['firstName', 'lastName'],
    },
    additional: {
        id: 'additional',
        label: 'Additional',
        widgets: ['notes'],
    },
};

const userLayout: Layout = {
    cards: ['account', 'personal', 'additional'],
};

const meta: Meta<typeof FormCard> = {
    title: 'Components/FormCard',
    component: FormCard,
    decorators: [
        Story => (
            <QueryClientProvider client={queryClient}>
                <Story />
            </QueryClientProvider>
        ),
    ],
};

export default meta;
type Story = StoryObj<typeof FormCard>;

export const CreateMode: Story = {
    args: {
        schema: userSchema,
        cards: userCards,
        layout: userLayout,
        mode: 'create',
        title: 'Create User',
        onSubmit: async (data, mode) => {
            console.log('Submit:', mode, data);
        },
        onCancel: () => console.log('Cancel'),
    },
    play: async ({canvasElement}) => {
        const canvas = within(canvasElement);

        // Find required fields by label
        const usernameInput = canvas.getByLabelText('Username');
        const emailInput = canvas.getByLabelText('Email Address');

        // Fill required fields — Save button becomes active once form is dirty
        await userEvent.type(usernameInput, 'newuser');
        await userEvent.type(emailInput, 'newuser@example.com');

        await expect(usernameInput).toHaveValue('newuser');
        await expect(emailInput).toHaveValue('newuser@example.com');

        // Save button should now be enabled
        const saveButton = canvas.getByRole('button', {name: /save/i});
        await expect(saveButton).not.toBeDisabled();
    },
};

export const EditMode: Story = {
    args: {
        schema: userSchema,
        cards: userCards,
        layout: userLayout,
        mode: 'edit',
        title: 'Edit User',
        defaultValues: {
            userName: 'alice',
            emailAddress: 'alice@example.com',
            firstName: 'Alice',
            lastName: 'Smith',
            isActive: true,
            roleId: 1,
            notes: 'VIP user',
        },
        onSubmit: async (data, mode) => {
            console.log('Submit:', mode, data);
        },
        onCancel: () => console.log('Cancel'),
    },
    play: async ({canvasElement}) => {
        const canvas = within(canvasElement);

        // Verify pre-populated values
        const usernameInput = canvas.getByLabelText('Username');
        await expect(usernameInput).toHaveValue('alice');

        // Cancel button should be present
        const cancelButton = canvas.getByRole('button', {name: /cancel/i});
        await expect(cancelButton).toBeVisible();
        await userEvent.click(cancelButton);
    },
};

export const Loading: Story = {
    args: {
        schema: userSchema,
        cards: userCards,
        layout: userLayout,
        mode: 'edit',
        title: 'Loading User...',
        isLoading: true,
        onSubmit: async () => {},
    },
};
