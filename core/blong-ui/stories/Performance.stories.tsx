import React from 'react';
import type {Meta, StoryObj} from '@storybook/react-vite';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {SkeletonField, SkeletonCard, SkeletonTable, PageSkeleton, LazyPage} from '../src/components/Performance.js';

const queryClient = new QueryClient({defaultOptions: {queries: {retry: false}}});

const meta: Meta<typeof SkeletonCard> = {
    title: 'Components/Performance',
    component: SkeletonCard,
    decorators: [
        (Story) => (
            <QueryClientProvider client={queryClient}>
                <Story />
            </QueryClientProvider>
        ),
    ],
};
export default meta;
type Story = StoryObj<typeof SkeletonCard>;

export const SkeletonFieldStory: Story = {
    name: 'SkeletonField',
    render: () => (
        <div style={{display: 'flex', flexDirection: 'column', gap: '8px', padding: '16px'}}>
            <SkeletonField width="100%" />
            <SkeletonField width="75%" />
            <SkeletonField width="50%" height="32px" />
            <SkeletonField width="25%" height="48px" />
        </div>
    ),
}

export const SkeletonCardStory: Story = {
    name: 'SkeletonCard',
    render: () => (
        <div style={{padding: '16px', maxWidth: '400px'}}>
            <SkeletonCard fields={4} />
        </div>
    ),
}

export const SkeletonTableStory: Story = {
    name: 'SkeletonTable',
    render: () => (
        <div style={{padding: '16px'}}>
            <SkeletonTable rows={5} columns={4} />
        </div>
    ),
}

export const PageSkeletonStory: Story = {
    name: 'PageSkeleton',
    render: () => <PageSkeleton />,
}

export const LazyPageStory: Story = {
    name: 'LazyPage',
    render: () => {
        const importFn = () => Promise.resolve({default: () => <div>Lazily loaded component</div>})
        return <LazyPage importFn={importFn} />
    },
}
