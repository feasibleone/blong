import {act} from '@testing-library/react';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {useAppStore} from '../../state/appStore.js';
import {fireEvent, flushEffects, render, screen, waitFor} from '../../test/render.js';
import {AccountMenu} from './AccountMenu.js';

const profileConfig = {
    name: 'app',
    title: 'App',
    profile: {page: 'access.user.profile', get: 'access.profile.get'},
};

beforeEach(() => {
    useAppStore.setState(s => ({
        ...s,
        auth: {token: 't', profile: null, permissions: {}, isAuthenticated: true},
        portal: {tabs: [], activeTabId: null, portalConfig: null},
    }));
});

describe('AccountMenu', () => {
    it('renders the avatar with a fallback user icon when no profile is known', async () => {
        render(<AccountMenu />);
        await flushEffects();
        const avatar = document.querySelector('.blong-account-menu__avatar');
        expect(avatar).toBeInTheDocument();
        expect(avatar?.querySelector('.pi-user')).toBeTruthy();
    });

    it('shows the initials from the store profile', async () => {
        act(() => {
            useAppStore.setState(s => ({
                ...s,
                auth: {...s.auth, profile: {actorId: 'a', name: 'Jane Doe', initials: 'JD'}},
            }));
        });
        render(<AccountMenu />);
        await flushEffects();
        expect(document.querySelector('.blong-account-menu__avatar')?.textContent).toContain('JD');
    });

    it('fetches the profile from the configured get method and shows derived initials', async () => {
        const dispatch = vi.fn(async (method: string) => {
            if (method === 'access.profile.get') {
                return {
                    userId: 'a',
                    userName: 'testAdmin',
                    firstName: 'Jane',
                    lastName: 'Doe',
                    emailAddress: 'jane@example.com',
                    preferredLanguage: 'en',
                };
            }
            throw new Error(`unexpected method ${method}`);
        });
        act(() => {
            useAppStore.setState(s => ({...s, portal: {...s.portal, portalConfig: profileConfig}}));
        });
        render(<AccountMenu />, {dispatch});
        await waitFor(() =>
            expect(document.querySelector('.blong-account-menu__avatar')?.textContent).toContain(
                'JD',
            ),
        );
        expect(useAppStore.getState().auth.profile?.name).toBe('Jane Doe');
    });

    it('reads the personal name from the nested person object (access.profile.get shape)', async () => {
        const dispatch = vi.fn(async (method: string) => {
            if (method === 'access.profile.get') {
                return {
                    userId: 'a',
                    userName: 'testAdmin',
                    emailAddress: 'testAdmin@example.com',
                    person: {firstName: 'Test', lastName: 'Admin'},
                };
            }
            throw new Error(`unexpected method ${method}`);
        });
        act(() => {
            useAppStore.setState(s => ({...s, portal: {...s.portal, portalConfig: profileConfig}}));
        });
        render(<AccountMenu />, {dispatch});
        await waitFor(() =>
            expect(document.querySelector('.blong-account-menu__avatar')?.textContent).toContain(
                'TA',
            ),
        );
        expect(useAppStore.getState().auth.profile?.name).toBe('Test Admin');
    });

    it('opens the profile page as a portal tab from the menu', async () => {
        const dispatch = vi.fn(async (method: string) => {
            if (method === 'access.profile.get') {
                return {userId: 'a', firstName: 'Jane', lastName: 'Doe'};
            }
            if (method === 'component/access.user.profile') {
                return {
                    title: 'Profile',
                    component: () => Promise.resolve(() => <div>Profile page</div>),
                };
            }
            if (method === 'authLogout') return {success: true};
            throw new Error(`unexpected method ${method}`);
        });
        act(() => {
            useAppStore.setState(s => ({...s, portal: {...s.portal, portalConfig: profileConfig}}));
        });
        render(<AccountMenu />, {dispatch});
        await waitFor(() =>
            expect(document.querySelector('.blong-account-menu__avatar')).toBeTruthy(),
        );
        fireEvent.click(document.querySelector('.blong-account-menu__avatar')!);
        await flushEffects();
        const profileItem = await screen.findByText('Profile');
        fireEvent.click(profileItem);
        await waitFor(() => {
            const tabs = useAppStore.getState().portal.tabs;
            expect(tabs.some(t => t.actionName === 'access.user.profile')).toBe(true);
        });
    });

    it('only offers Sign out when no profile page is configured', async () => {
        const dispatch = vi.fn(async (method: string) => {
            if (method === 'authLogout') return {success: true};
            throw new Error(`unexpected method ${method}`);
        });
        render(<AccountMenu />, {dispatch});
        await flushEffects();
        fireEvent.click(document.querySelector('.blong-account-menu__avatar')!);
        await flushEffects();
        expect(screen.queryByText('Profile')).toBeNull();
        expect(screen.getByText('Sign out')).toBeInTheDocument();
    });
});
