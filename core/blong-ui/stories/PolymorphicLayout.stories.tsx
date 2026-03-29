/**
 * PolymorphicLayout Storybook stories.
 *
 * Demonstrates layout switching based on a type field value.
 * The component reads the `typeField` value from the form state and selects
 * the matching layout key (e.g. `editTransfer`, `editPayment`, `editDefault`).
 */

import React from 'react';
import type {Meta, StoryObj} from '@storybook/react-vite';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';

import {PolymorphicLayout} from '../src/components/PolymorphicLayout.js';
import type {BlongSchema, Cards, Layouts} from '../src/types.js';

const queryClient = new QueryClient({
    defaultOptions: {queries: {retry: false}},
});

// ── Shared schema ─────────────────────────────────────────────────────────────

const transactionSchema: BlongSchema = {
    type: 'object',
    required: ['transactionType', 'amount'],
    properties: {
        transactionType: {
            type: 'string',
            title: 'Transaction Type',
            enum: ['transfer', 'payment', 'default'],
            'x-blong-order': 1,
        },
        amount: {type: 'number', title: 'Amount', 'x-blong-order': 2},
        // Transfer-specific
        sourceAccount: {type: 'string', title: 'Source Account', 'x-blong-order': 3},
        destinationAccount: {type: 'string', title: 'Destination Account', 'x-blong-order': 4},
        // Payment-specific
        payeeId: {type: 'integer', title: 'Payee', 'x-blong-order': 3},
        payeeReference: {type: 'string', title: 'Payment Reference', 'x-blong-order': 4},
        // Shared
        description: {type: 'string', title: 'Description', 'x-blong-order': 5},
        notes: {type: 'string', title: 'Notes', maxLength: 500, 'x-blong-order': 6},
    },
} as BlongSchema;

// ── Cards ─────────────────────────────────────────────────────────────────────

const cards: Cards = {
    base: {id: 'base', label: 'Transaction', widgets: ['transactionType', 'amount', 'description']},
    transfer: {id: 'transfer', label: 'Transfer Details', widgets: ['sourceAccount', 'destinationAccount']},
    payment: {id: 'payment', label: 'Payment Details', widgets: ['payeeId', 'payeeReference']},
    extra: {id: 'extra', label: 'Additional', widgets: ['notes']},
};

// ── Layouts ───────────────────────────────────────────────────────────────────

const layouts: Layouts = {
    editDefault: {cards: ['base', 'extra']},
    editTransfer: {cards: ['base', 'transfer', 'extra']},
    editPayment: {cards: ['base', 'payment', 'extra']},
};

// ── Meta ──────────────────────────────────────────────────────────────────────

const meta: Meta<typeof PolymorphicLayout> = {
    title: 'Components/PolymorphicLayout',
    component: PolymorphicLayout,
    decorators: [
        Story => (
            <QueryClientProvider client={queryClient}>
                <Story />
            </QueryClientProvider>
        ),
    ],
    args: {
        schema: transactionSchema,
        cards,
        layouts,
        mode: 'edit',
        typeField: 'transactionType',
        onSubmit: async (data) => console.log('Submit:', data),
    },
};
export default meta;
type Story = StoryObj<typeof PolymorphicLayout>;

// ── Stories ───────────────────────────────────────────────────────────────────

/** Default layout — no type value matches; falls back to `editDefault`. */
export const DefaultLayout: Story = {
    args: {
        defaultValues: {transactionType: 'default', amount: 0},
    },
};

/** Transfer layout — `transactionType === 'transfer'` activates `editTransfer`. */
export const TransferLayout: Story = {
    args: {
        defaultValues: {
            transactionType: 'transfer',
            amount: 1000,
            sourceAccount: 'ACC-001',
            destinationAccount: 'ACC-002',
        },
    },
};

/** Payment layout — `transactionType === 'payment'` activates `editPayment`. */
export const PaymentLayout: Story = {
    args: {
        defaultValues: {
            transactionType: 'payment',
            amount: 250,
            payeeId: 42,
            payeeReference: 'INV-2024-0099',
        },
    },
};

/** Create mode — uses `createDefault` layout key; falls back to `editDefault`. */
export const CreateMode: Story = {
    args: {
        mode: 'create',
        defaultValues: {transactionType: 'transfer'},
    },
};

/** Missing layout — no matching key; displays the error message. */
export const MissingLayout: Story = {
    args: {
        layouts: {editDefault: {cards: ['base']}},
        defaultValues: {transactionType: 'unknown'},
    },
};
