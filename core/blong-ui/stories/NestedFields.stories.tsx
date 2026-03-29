/**
 * NestedFields Storybook stories.
 *
 * Demonstrates NestedFieldset (nested object) and ArrayFields (repeatable
 * array sections) wrapped in a FormProvider context.
 */

import type {Meta, StoryObj} from '@storybook/react-vite';
import {expect, userEvent, waitFor, within} from '@storybook/test';
import {FormProvider, useForm} from 'react-hook-form';

import type {ArrayFieldsProps, NestedFieldsetProps} from '../src/factory/NestedFields.js';
import {ArrayFields, NestedFieldset} from '../src/factory/NestedFields.js';
import type {BlongSchemaProperty} from '../src/types.js';

// ── Sample schemas ────────────────────────────────────────────────────────────

const addressSchema: BlongSchemaProperty = {
    type: 'object',
    title: 'Address',
    properties: {
        street: {type: 'string', title: 'Street', 'x-blong-order': 1},
        city: {type: 'string', title: 'City', 'x-blong-order': 2},
        zipCode: {type: 'string', title: 'Zip Code', 'x-blong-order': 3},
    },
} as BlongSchemaProperty;

const phoneSchema: BlongSchemaProperty = {
    type: 'object',
    properties: {
        phoneNumber: {type: 'string', title: 'Phone Number'},
        phoneType: {type: 'string', title: 'Type', enum: ['mobile', 'home', 'work']},
    },
} as BlongSchemaProperty;

// ── Wrappers ──────────────────────────────────────────────────────────────────

function NestedFieldsetWrapper(props: NestedFieldsetProps) {
    const form = useForm({defaultValues: {address: {street: '', city: '', zipCode: ''}}});
    return (
        <FormProvider {...form}>
            <form>
                <NestedFieldset {...props} />
            </form>
        </FormProvider>
    );
}

function ArrayFieldsWrapper(props: ArrayFieldsProps) {
    const form = useForm({defaultValues: {phones: []}});
    return (
        <FormProvider {...form}>
            <form>
                <ArrayFields {...props} />
                <button type="submit">Save</button>
            </form>
        </FormProvider>
    );
}

// ── Meta ──────────────────────────────────────────────────────────────────────

const meta: Meta = {
    title: 'Factory/NestedFields',
};

export default meta;

// ── Stories ───────────────────────────────────────────────────────────────────

export const NestedFieldsetStory: StoryObj<typeof NestedFieldsetWrapper> = {
    name: 'NestedFieldset',
    render: () => (
        <NestedFieldsetWrapper
            name="address"
            schema={addressSchema}
            label="Address"
        />
    ),
};

export const ArrayFieldsStory: StoryObj<typeof ArrayFieldsWrapper> = {
    name: 'ArrayFields',
    render: () => (
        <ArrayFieldsWrapper
            name="phones"
            itemSchema={phoneSchema}
            label="Phone Numbers"
        />
    ),
    play: async ({canvasElement}) => {
        const canvas = within(canvasElement);
        const addButton = canvas.getByRole('button', {name: /add/i});
        await userEvent.click(addButton);
        await expect(canvas.getByText('#1')).toBeInTheDocument();
    },
};

export const ArrayFieldsWithMaxItems: StoryObj<typeof ArrayFieldsWrapper> = {
    name: 'ArrayFields (Max 2 Items)',
    render: () => (
        <ArrayFieldsWrapper
            name="phones"
            itemSchema={phoneSchema}
            label="Phone Numbers (max 2)"
            maxItems={2}
        />
    ),
    play: async ({canvasElement}) => {
        const canvas = within(canvasElement);

        // First add — button may be remounted by React as array grows,
        // so re-query the button reference before each click.
        await userEvent.click(canvas.getByRole('button', {name: /\+ add/i}));
        await canvas.findByText('#1'); // wait for async state update

        // Second add — fresh query avoids stale DOM reference
        await userEvent.click(canvas.getByRole('button', {name: /\+ add/i}));
        // waitFor handles any residual async rendering after the second append
        await waitFor(() => expect(canvas.getByText('#2')).toBeInTheDocument(), {timeout: 3000});

        await waitFor(() => expect(canvas.getByRole('button', {name: /\+ add/i})).toBeDisabled());
    },
};
