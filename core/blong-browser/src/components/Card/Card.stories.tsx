import type {Meta, StoryObj} from '@storybook/react-vite';
import {Card} from './Card.js';

const meta: Meta<typeof Card> = {
    title: 'Layout/Card',
    component: Card,
    tags: ['autodocs'],
    parameters: {layout: 'padded'},
};
export default meta;

type Story = StoryObj<typeof Card>;

export const Default: Story = {
    args: {
        title: 'Sample Card',
        children: <p>Card content goes here.</p>,
    },
};

export const Collapsible: Story = {
    args: {
        title: 'Collapsible Card',
        collapsible: true,
        children: <p>This card can be collapsed.</p>,
    },
};

export const Loading: Story = {
    args: {
        title: 'Loading Card',
        loading: true,
        children: <p>Skeleton shown while loading.</p>,
    },
};
