import type {Meta, StoryObj} from '@storybook/react-vite';
import {useEffect} from 'react';
import {useAppStore} from '../../state/appStore.js';
import type {IUserProfile} from '../../types/permission.js';
import {AccountMenu} from './AccountMenu.js';

/**
 * AccountMenu stories — the top-right avatar + dropdown in the portal menubar.
 *
 * The global `withDispatch` decorator wraps every story in <App> providing
 * BlongProvider + Theme context. Each story seeds the Zustand app store with a
 * known profile + portal profile config, then cleans up on unmount.
 */
const meta: Meta<typeof AccountMenu> = {
    title: 'AccountMenu',
    component: AccountMenu,
    parameters: {layout: 'padded'},
    tags: ['autodocs'],
};
export default meta;

type Story = StoryObj<typeof meta>;

function MenuSetup({profile}: {profile: IUserProfile | null}) {
    useEffect(() => {
        useAppStore.setState(s => ({
            ...s,
            auth: {token: 't', profile, permissions: {}, isAuthenticated: true},
            portal: {
                tabs: [],
                activeTabId: null,
                portalConfig: {
                    name: 'app',
                    title: 'App',
                    profile: {page: 'access.user.profile', get: 'access.profile.get'},
                },
            },
        }));
        return () => {
            useAppStore.setState(s => ({
                ...s,
                auth: {token: null, profile: null, permissions: {}, isAuthenticated: false},
                portal: {tabs: [], activeTabId: null, portalConfig: null},
            }));
        };
        // eslint-disable-next-line @eslint-react/exhaustive-deps -- run once on mount
    }, []);
    return <AccountMenu />;
}

export const WithInitials: Story = {
    render: () => (
        <MenuSetup
            profile={{actorId: 'a', name: 'Jane Doe', initials: 'JD', language: 'en'}}
        />
    ),
};

export const WithNameOnly: Story = {
    render: () => <MenuSetup profile={{actorId: 'a', name: 'Jane Doe'}} />,
};

export const UnknownUser: Story = {
    render: () => <MenuSetup profile={null} />,
};
