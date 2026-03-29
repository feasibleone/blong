/**
 * CascadedDropdown Storybook stories.
 *
 * Demonstrates parent-child dropdown filtering, standalone dropdown usage,
 * and the disabled state.
 */

import React from 'react';
import type {Meta, StoryObj} from '@storybook/react-vite';
import {within, userEvent, expect} from '@storybook/test';
import {FormProvider, useForm} from 'react-hook-form';

import {CascadedDropdown} from '../src/factory/CascadedDropdown.js';
import type {DropdownOption} from '../src/types.js';

// ── Sample data ───────────────────────────────────────────────────────────────

const countryOptions: DropdownOption[] = [
    {value: 1, label: 'USA'},
    {value: 2, label: 'UK'},
];

const cityOptions: DropdownOption[] = [
    {value: 101, label: 'New York', parent: 1},
    {value: 102, label: 'Los Angeles', parent: 1},
    {value: 201, label: 'London', parent: 2},
    {value: 202, label: 'Manchester', parent: 2},
];

// ── Demo wrapper showing country + city cascaded ──────────────────────────────

function CascadedDropdownDemo() {
    const form = useForm({defaultValues: {countryId: '', cityId: ''}});
    return (
        <FormProvider {...form}>
            <form style={{display: 'grid', gap: '8px', maxWidth: '300px'}}>
                <CascadedDropdown
                    name="countryId"
                    label="Country"
                    options={countryOptions}
                />
                <CascadedDropdown
                    name="cityId"
                    label="City"
                    options={cityOptions}
                    parentField="countryId"
                />
            </form>
        </FormProvider>
    );
}

function StandaloneDropdownDemo() {
    const form = useForm({defaultValues: {countryId: ''}});
    return (
        <FormProvider {...form}>
            <form style={{maxWidth: '300px'}}>
                <CascadedDropdown
                    name="countryId"
                    label="Country"
                    options={countryOptions}
                />
            </form>
        </FormProvider>
    );
}

function DisabledDropdownDemo() {
    const form = useForm({defaultValues: {countryId: ''}});
    return (
        <FormProvider {...form}>
            <form style={{maxWidth: '300px'}}>
                <CascadedDropdown
                    name="countryId"
                    label="Country"
                    options={countryOptions}
                    disabled
                />
            </form>
        </FormProvider>
    );
}

// ── Meta ──────────────────────────────────────────────────────────────────────

const meta: Meta = {
    title: 'Factory/CascadedDropdown',
};

export default meta;

// ── Stories ───────────────────────────────────────────────────────────────────

export const ParentChildFiltering: StoryObj = {
    name: 'Parent-Child Filtering',
    render: () => <CascadedDropdownDemo />,
    play: async ({canvasElement}) => {
        const canvas = within(canvasElement);

        const countrySelect = canvas.getByLabelText('Country');
        const citySelect = canvas.getByLabelText('City');

        // Verify city is disabled before any interaction (no parent selected yet)
        await expect(citySelect).toBeInTheDocument();
        await expect(citySelect).toBeDisabled();

        // Select USA
        await userEvent.selectOptions(countrySelect, '1');

        // City should now be enabled and show only USA cities
        await expect(citySelect).not.toBeDisabled();
        await expect(canvas.getByRole('option', {name: 'New York'})).toBeInTheDocument();
        await expect(canvas.getByRole('option', {name: 'Los Angeles'})).toBeInTheDocument();
        await expect(canvas.queryByRole('option', {name: 'London'})).not.toBeInTheDocument();

        // Switch to UK
        await userEvent.selectOptions(countrySelect, '2');
        await expect(canvas.getByRole('option', {name: 'London'})).toBeInTheDocument();
        await expect(canvas.getByRole('option', {name: 'Manchester'})).toBeInTheDocument();
        await expect(canvas.queryByRole('option', {name: 'New York'})).not.toBeInTheDocument();
    },
};

export const NoParentField: StoryObj = {
    name: 'No Parent Field (Standalone)',
    render: () => <StandaloneDropdownDemo />,
};

export const Disabled: StoryObj = {
    name: 'Disabled',
    render: () => <DisabledDropdownDemo />,
};
