import React from 'react';
import type {Meta, StoryObj} from '@storybook/react-vite';
import {within, userEvent, expect} from '@storybook/test';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {ThemeProvider, ThemeToggle} from '../src/components/ThemeProvider.js';
import {ThemeSelector} from '../src/components/ThemeSelector.js';

const queryClient = new QueryClient({defaultOptions: {queries: {retry: false}}})

const meta: Meta<typeof ThemeProvider> = {
    title: 'Components/ThemeProvider',
    component: ThemeProvider,
    decorators: [
        (Story) => (
            <QueryClientProvider client={queryClient}>
                <Story />
            </QueryClientProvider>
        ),
    ],
}
export default meta
type Story = StoryObj<typeof ThemeProvider>

const SampleCard = () => (
    <div style={{padding: '16px', background: 'var(--surface-0, #fff)', color: 'var(--text-color, #333)', borderRadius: '8px'}}>
        <h3>Sample Content</h3>
        <p>This content respects the active theme.</p>
    </div>
)

export const LightMode: Story = {
    render: () => (
        <ThemeProvider initialMode="light">
            <SampleCard />
        </ThemeProvider>
    ),
}

export const DarkMode: Story = {
    render: () => (
        <ThemeProvider initialMode="dark">
            <SampleCard />
        </ThemeProvider>
    ),
}

export const ThemeToggleStory: Story = {
    name: 'ThemeToggle',
    render: () => (
        <ThemeProvider initialMode="light">
            <ThemeToggle />
        </ThemeProvider>
    ),
    play: async ({canvasElement}) => {
        const canvas = within(canvasElement)
        const toggle = canvas.getByRole('button')
        const initialText = toggle.textContent
        await userEvent.click(toggle)
        const updatedText = toggle.textContent
        expect(updatedText).not.toBe(initialText)
    },
}

export const ThemeSelectorStory: Story = {
    name: 'ThemeSelector',
    render: () => (
        <ThemeProvider initialMode="light">
            <ThemeSelector showLabel />
        </ThemeProvider>
    ),
}
