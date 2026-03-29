/**
 * CascadedTable Storybook stories.
 */

import React, {useState} from 'react';
import type {Meta, StoryObj} from '@storybook/react-vite';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';

import {CascadedTable} from '../src/components/CascadedTable.js';
import type {BlongSchema} from '../src/types.js';

const queryClient = new QueryClient({
    defaultOptions: {queries: {retry: false}},
});

const orderSchema: BlongSchema = {
    type: 'array',
    items: {
        type: 'object',
        properties: {
            orderId: {type: 'integer', title: 'Order ID', 'x-blong-order': 1},
            customerId: {type: 'integer', title: 'Customer ID', 'x-blong-order': 2},
            orderDate: {type: 'string', title: 'Date', format: 'date', 'x-blong-order': 3},
            totalAmount: {type: 'number', title: 'Total', 'x-blong-order': 4},
        },
    },
} as BlongSchema;

function CascadedTableWrapper({
    parentSelection,
}: {
    parentSelection?: Record<string, unknown>;
}) {
    return (
        <div style={{padding: '1rem'}}>
            <div style={{marginBottom: '1rem', padding: '0.5rem', background: '#f5f5f5', borderRadius: '4px'}}>
                <strong>Parent selection:</strong>{' '}
                {parentSelection ? JSON.stringify(parentSelection) : <em>none</em>}
            </div>
            <CascadedTable
                schema={orderSchema}
                fetchMethod="order.order.find"
                parentField="customerId"
                parentSelection={parentSelection}
                parentKey="customerId"
                title="Orders"
                selectionMode="single"
                onSelectionChange={(sel) => console.log('Child selected:', sel)}
            />
        </div>
    );
}

function InteractiveWrapper() {
    const [selected, setSelected] = useState<Record<string, unknown> | undefined>(undefined);
    const customers = [
        {customerId: 1, customerName: 'Alice'},
        {customerId: 2, customerName: 'Bob'},
    ];
    return (
        <div style={{padding: '1rem'}}>
            <div style={{marginBottom: '1rem'}}>
                <strong>Select a customer:</strong>{' '}
                {customers.map(c => (
                    <button
                        key={c.customerId}
                        onClick={() => setSelected(c)}
                        style={{
                            marginRight: '0.5rem',
                            padding: '0.25rem 0.75rem',
                            background: selected?.customerId === c.customerId ? '#0066cc' : '#e0e0e0',
                            color: selected?.customerId === c.customerId ? '#fff' : '#333',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                        }}
                    >
                        {c.customerName}
                    </button>
                ))}
                <button
                    onClick={() => setSelected(undefined)}
                    style={{padding: '0.25rem 0.75rem', background: '#e0e0e0', border: 'none', borderRadius: '4px', cursor: 'pointer'}}
                >
                    Clear
                </button>
            </div>
            <CascadedTable
                schema={orderSchema}
                fetchMethod="order.order.find"
                parentField="customerId"
                parentSelection={selected}
                parentKey="customerId"
                title="Orders"
            />
        </div>
    );
}

const meta: Meta<typeof CascadedTable> = {
    title: 'Components/CascadedTable',
    component: CascadedTable,
    decorators: [
        (Story) => (
            <QueryClientProvider client={queryClient}>
                <Story />
            </QueryClientProvider>
        ),
    ],
};

export default meta;
type Story = StoryObj<typeof CascadedTable>;

export const NoSelection: Story = {
    render: () => <CascadedTableWrapper parentSelection={undefined} />,
};

export const WithSelection: Story = {
    render: () => (
        <CascadedTableWrapper parentSelection={{customerId: 1, customerName: 'Alice'}} />
    ),
};

export const Interactive: Story = {
    render: () => <InteractiveWrapper />,
};
