import type {Meta, StoryObj} from '@storybook/react-vite';
import {OAuthCallback} from './OAuthCallback.js';

const meta: Meta<typeof OAuthCallback> = {
    title: 'Auth/OAuthCallback',
    component: OAuthCallback,
    tags: ['autodocs'],
    parameters: {layout: 'fullscreen'},
};
export default meta;
type Story = StoryObj<typeof OAuthCallback>;

export const SigningIn: Story = {
    args: {
        onExchange: async () => {
            await new Promise(r => setTimeout(r, 2000));
            console.log('exchanged');
        },
        title: 'Marine Science Portal',
    },
};

export const ExchangeError: Story = {
    args: {
        onExchange: async () => {
            throw {type: 'error.account.invalidGoogleToken', message: 'Invalid Google token'};
        },
        title: 'Marine Science Portal',
    },
};
