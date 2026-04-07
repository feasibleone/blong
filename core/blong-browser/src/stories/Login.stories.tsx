import type {Meta, StoryObj} from '@storybook/react';
import {Login} from '../components/Login/index.js';

const meta: Meta<typeof Login> = {
    title: 'Auth/Login',
    component: Login,
    tags: ['autodocs'],
    parameters: {layout: 'centered'},
};
export default meta;

type Story = StoryObj<typeof Login>;

export const Default: Story = {
    args: {
        onLogin: async params => {
            console.log('login params:', params);
            await new Promise(r => setTimeout(r, 1000));
        },
        title: 'Marine Science Portal',
    },
};

export const WithError: Story = {
    args: {
        onLogin: async () => {
            await new Promise(r => setTimeout(r, 500));
            throw {type: 'error.auth.invalid', message: 'Invalid username or password'};
        },
        title: 'Login — Always Fails',
    },
};
