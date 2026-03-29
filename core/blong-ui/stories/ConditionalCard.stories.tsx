/**
 * ConditionalCard Storybook stories.
 *
 * Demonstrates watch/match conditional visibility within a react-hook-form
 * FormProvider context.
 */

import React from 'react';
import type {Meta, StoryObj} from '@storybook/react-vite';
import {FormProvider, useForm} from 'react-hook-form';
import {within, userEvent, expect} from '@storybook/test';

import {ConditionalCard} from '../src/components/ConditionalCard.js';

// ── Wrapper component ─────────────────────────────────────────────────────────

interface WrapperProps {
    watchField: string;
    match: Record<string, unknown>;
    defaultValue: string;
    options: {value: string; label: string}[];
    children: React.ReactNode;
    className?: string;
}

function ConditionalCardWrapper({
    watchField,
    match,
    defaultValue,
    options,
    children,
    className,
}: WrapperProps) {
    const form = useForm({defaultValues: {[watchField]: defaultValue}});
    return (
        <FormProvider {...form}>
            <div style={{display: 'flex', flexDirection: 'column', gap: 12}}>
                <div>
                    <label htmlFor="watcher-select">Account Type</label>
                    <select id="watcher-select" {...form.register(watchField)}>
                        {options.map(opt => (
                            <option key={opt.value} value={opt.value}>
                                {opt.label}
                            </option>
                        ))}
                    </select>
                </div>
                <ConditionalCard watch={watchField} match={match} className={className}>
                    {children}
                </ConditionalCard>
            </div>
        </FormProvider>
    );
}

const accountOptions = [
    {value: 'personal', label: 'Personal'},
    {value: 'business', label: 'Business'},
];

const businessMatch = {business: 'business'};

// ── Meta ──────────────────────────────────────────────────────────────────────

const meta: Meta<typeof ConditionalCard> = {
    title: 'Components/ConditionalCard',
    component: ConditionalCard,
};

export default meta;
type Story = StoryObj<typeof ConditionalCard>;

// ── Stories ───────────────────────────────────────────────────────────────────

export const Visible: Story = {
    render: () => (
        <ConditionalCardWrapper
            watchField="accountType"
            match={businessMatch}
            defaultValue="business"
            options={accountOptions}
        >
            <p>Business-specific fields are visible.</p>
        </ConditionalCardWrapper>
    ),
};

export const Hidden: Story = {
    render: () => (
        <ConditionalCardWrapper
            watchField="accountType"
            match={businessMatch}
            defaultValue="personal"
            options={accountOptions}
        >
            <p>Business-specific fields (currently hidden).</p>
        </ConditionalCardWrapper>
    ),
};

export const Interactive: Story = {
    render: () => (
        <ConditionalCardWrapper
            watchField="accountType"
            match={businessMatch}
            defaultValue="personal"
            options={accountOptions}
        >
            <p data-testid="conditional-content">Business details are now visible!</p>
        </ConditionalCardWrapper>
    ),
    play: async ({canvasElement, step}) => {
        const canvas = within(canvasElement);

        await step('Card is initially hidden when personal is selected', async () => {
            expect(canvas.queryByTestId('conditional-content')).not.toBeInTheDocument();
        });

        await step('User switches to business account type', async () => {
            await userEvent.selectOptions(
                canvas.getByLabelText('Account Type'),
                'business',
            );
        });

        await step('Card becomes visible after match', async () => {
            expect(canvas.getByTestId('conditional-content')).toBeInTheDocument();
        });

        await step('User switches back to personal', async () => {
            await userEvent.selectOptions(
                canvas.getByLabelText('Account Type'),
                'personal',
            );
        });

        await step('Card is hidden again', async () => {
            expect(canvas.queryByTestId('conditional-content')).not.toBeInTheDocument();
        });
    },
};
