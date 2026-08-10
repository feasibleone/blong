import type {Meta, StoryObj} from '@storybook/react-vite';
import {SocialLoginButton} from './SocialLoginButton.js';

const meta: Meta<typeof SocialLoginButton> = {
    title: 'Auth/SocialLoginButton',
    component: SocialLoginButton,
    tags: ['autodocs'],
    parameters: {layout: 'centered'},
};
export default meta;
type Story = StoryObj<typeof SocialLoginButton>;

export const Google: Story = {
    args: {
        onClick: () => console.log('google clicked'),
    },
};

export const Loading: Story = {
    args: {
        onClick: () => console.log('google clicked'),
        loading: true,
    },
};

export const CustomLabel: Story = {
    args: {
        label: 'Sign in with Google',
        onClick: () => console.log('google clicked'),
    },
};
