import type {Meta, StoryObj} from '@storybook/react-vite';
import {Login} from './Login.js';

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

/**
 * A stand-in mark for the branded story — inline so the story needs no static
 * file. A suite names its own file here instead (`ui.portal.portal.brand`).
 */
const brandLogo =
    'data:image/svg+xml;utf8,' +
    encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
            <circle cx="32" cy="32" r="30" fill="#0b7285"/>
            <path d="M14 38c8-12 28-12 36 0" stroke="#e3fafc" stroke-width="5" fill="none"/>
            <circle cx="32" cy="22" r="5" fill="#e3fafc"/>
        </svg>`,
    );

/**
 * Branded — the login screen of a suite that named a brand: its own logo above
 * the form and its organisation below it, instead of the default globe.
 */
export const Branded: Story = {
    args: {
        onLogin: async () => {
            await new Promise(r => setTimeout(r, 1000));
        },
        title: 'Blong Sport',
        logoUrl: brandLogo,
        orgTitle: 'Feasible One',
        orgIcon: 'pi pi-building',
    },
};
