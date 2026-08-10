import type {Meta, StoryObj} from '@storybook/react-vite';
import {SelfRegistration} from './SelfRegistration.js';

const meta: Meta<typeof SelfRegistration> = {
    title: 'Auth/SelfRegistration',
    component: SelfRegistration,
    tags: ['autodocs'],
    parameters: {layout: 'fullscreen'},
};
export default meta;
type Story = StoryObj<typeof SelfRegistration>;

export const Default: Story = {
    args: {
        onRegister: async params => {
            console.log('register params:', params);
            await new Promise(r => setTimeout(r, 1000));
        },
        onGoogle: () => console.log('google login clicked'),
        title: 'Marine Science Portal',
        orgTitle: 'Feasible One',
    },
};

export const WithError: Story = {
    args: {
        onRegister: async () => {
            await new Promise(r => setTimeout(r, 500));
            throw {type: 'error.account.exists', message: 'Account with this email already exists'};
        },
        onGoogle: () => console.log('google login clicked'),
        title: 'Marine Science Portal',
    },
};

export const PasswordOnly: Story = {
    args: {
        onRegister: async params => {
            console.log('register params:', params);
            await new Promise(r => setTimeout(r, 1000));
        },
        title: 'Marine Science Portal',
    },
};
