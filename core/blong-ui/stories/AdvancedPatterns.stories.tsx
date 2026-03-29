/**
 * Advanced pattern Storybook stories.
 */

import type {Meta, StoryObj} from '@storybook/react-vite';
import {expect, userEvent, within} from '@storybook/test';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';

import {MasterDetail} from '../src/components/MasterDetail.js';
import {PivotTable} from '../src/components/PivotTable.js';
import type {BlongSchema, Cards, Layout} from '../src/types.js';

const queryClient = new QueryClient({
    defaultOptions: {queries: {retry: false}},
});

// ── MasterDetail Story ────────────────────────────────────────────────────────

const tableSchema: BlongSchema = {
    type: 'array',
    items: {
        type: 'object',
        properties: {
            userId: {type: 'integer', title: 'ID', 'x-blong-order': 1},
            userName: {type: 'string', title: 'Username', 'x-blong-order': 2},
            emailAddress: {type: 'string', title: 'Email', 'x-blong-order': 3},
        },
    },
} as BlongSchema;

const formSchema: BlongSchema = {
    type: 'object',
    required: ['userName'],
    properties: {
        userName: {type: 'string', title: 'Username', 'x-blong-order': 1},
        emailAddress: {type: 'string', title: 'Email', 'x-blong-order': 2},
        firstName: {type: 'string', title: 'First Name', 'x-blong-order': 3},
    },
} as BlongSchema;

const formCards: Cards = {
    details: {id: 'details', label: 'Details', widgets: ['userName', 'emailAddress', 'firstName']},
};

const formLayout: Layout = {cards: ['details']};

const sampleData = [
    {userId: 1, userName: 'alice', emailAddress: 'alice@example.com', firstName: 'Alice'},
    {userId: 2, userName: 'bob', emailAddress: 'bob@example.com', firstName: 'Bob'},
    {userId: 3, userName: 'charlie', emailAddress: 'charlie@example.com', firstName: 'Charlie'},
];

const masterDetailMeta: Meta<typeof MasterDetail> = {
    title: 'Patterns/MasterDetail',
    component: MasterDetail,
    decorators: [
        Story => (
            <QueryClientProvider client={queryClient}>
                <Story />
            </QueryClientProvider>
        ),
    ],
};

export default masterDetailMeta;
type MasterDetailStory = StoryObj<typeof MasterDetail>;

export const Default: MasterDetailStory = {
    args: {
        tableSchema,
        formSchema,
        formCards,
        formLayout,
        data: sampleData,
        totalRecords: sampleData.length,
        onSubmit: async (data, idx) => console.log('Save row', idx, data),
        masterTitle: 'Users',
        detailTitle: 'Edit User',
    },
    play: async ({canvasElement}) => {
        const canvas = within(canvasElement);

        // Verify the master table renders
        const aliceCell = await canvas.findByText('alice');
        await expect(aliceCell).toBeVisible();

        // Click the alice row to select it and populate the detail form
        await userEvent.click(aliceCell);

        // Detail form should now show alice’s username pre-filled
        const usernameInput = await canvas.findByDisplayValue('alice');
        await expect(usernameInput).toBeVisible();
    },
};

// ── PivotTable Story ──────────────────────────────────────────────────────────

const pivotSchema: BlongSchema = {
    type: 'array',
    items: {
        type: 'object',
        properties: {
            currencyCode: {type: 'string', title: 'Currency', 'x-blong-order': 1},
            balance: {type: 'number', title: 'Balance', 'x-blong-order': 2},
        },
    },
} as BlongSchema;

export const StaticPivotExample: MasterDetailStory = {
    render: () => (
        <QueryClientProvider client={queryClient}>
            <PivotTable
                schema={pivotSchema}
                data={[
                    {currencyCode: 'USD', balance: 1000},
                    {currencyCode: 'EUR', balance: 500},
                ]}
                pivot={{
                    examples: [{currencyCode: 'USD'}, {currencyCode: 'EUR'}, {currencyCode: 'GBP'}],
                    join: 'currencyCode',
                }}
            />
        </QueryClientProvider>
    ),
};
