/**
 * ErrorBoundary Storybook stories.
 *
 * Demonstrates error boundary catching, fallback UI, and the RpcErrorDisplay
 * component for typed JSON-RPC error presentation.
 */

import React, {useState} from 'react';
import type {Meta, StoryObj} from '@storybook/react-vite';
import {within, userEvent, expect} from '@storybook/test';

import {ErrorBoundary, RpcErrorDisplay} from '../src/components/ErrorBoundary.js';
import type {RpcError} from '../src/types.js';

// ── Helper components ─────────────────────────────────────────────────────────

function ThrowingChild({shouldThrow}: {shouldThrow: boolean}) {
    if (shouldThrow) throw new Error('Child component crashed!');
    return <div>Content rendered successfully.</div>;
}

function ThrowingButton() {
    const [shouldThrow, setShouldThrow] = useState(false);
    return (
        <div>
            <ThrowingChild shouldThrow={shouldThrow} />
            <button onClick={() => setShouldThrow(true)}>Trigger Error</button>
        </div>
    );
}

// ── Meta ──────────────────────────────────────────────────────────────────────

const meta: Meta<typeof ErrorBoundary> = {
    title: 'Components/ErrorBoundary',
    component: ErrorBoundary,
};

export default meta;
type Story = StoryObj<typeof ErrorBoundary>;

// ── Stories ───────────────────────────────────────────────────────────────────

export const Default: Story = {
    render: () => (
        <ErrorBoundary>
            <div>Normal content — no errors here.</div>
        </ErrorBoundary>
    ),
};

export const ChildError: Story = {
    render: () => (
        <ErrorBoundary>
            <ThrowingButton />
        </ErrorBoundary>
    ),
    play: async ({canvasElement, step}) => {
        const canvas = within(canvasElement);

        await step('Initial content renders without error', async () => {
            expect(canvas.getByText('Content rendered successfully.')).toBeInTheDocument();
        });

        await step('User triggers the error', async () => {
            await userEvent.click(canvas.getByRole('button', {name: /trigger error/i}));
        });

        await step('Error boundary shows fallback with error message', async () => {
            expect(canvas.getByText(/something went wrong/i)).toBeInTheDocument();
            expect(canvas.getByText('Child component crashed!')).toBeInTheDocument();
        });

        await step('User can recover via Try Again', async () => {
            await userEvent.click(canvas.getByRole('button', {name: /try again/i}));
            expect(canvas.getByText('Content rendered successfully.')).toBeInTheDocument();
        });
    },
};

export const WithCustomFallback: Story = {
    render: () => (
        <ErrorBoundary fallback={<div role="alert">Custom fallback UI — the page recovered gracefully.</div>}>
            <ThrowingButton />
        </ErrorBoundary>
    ),
    play: async ({canvasElement, step}) => {
        const canvas = within(canvasElement);

        await step('User triggers the error', async () => {
            await userEvent.click(canvas.getByRole('button', {name: /trigger error/i}));
        });

        await step('Custom fallback is shown', async () => {
            expect(canvas.getByRole('alert')).toBeInTheDocument();
        });
    },
};

// ── RpcErrorDisplay stories (rendered directly via render function) ────────────

const simpleRpcError: RpcError = {
    type: 'user.notFound',
    message: 'User not found.',
    print: 'The requested user does not exist in the system.',
};

export const RpcErrorStory: Story = {
    name: 'RpcError Display',
    render: () => <RpcErrorDisplay error={simpleRpcError} />,
};

const validationRpcError: RpcError = {
    type: 'validation.error',
    message: 'Validation failed.',
    validation: [
        {field: 'emailAddress', type: 'format', message: 'Must be a valid email address.'},
        {field: 'userName', type: 'required', message: 'Username is required.'},
    ],
};

export const ValidationErrors: Story = {
    render: () => <RpcErrorDisplay error={validationRpcError} />,
};
