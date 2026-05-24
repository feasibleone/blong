import {act} from '@testing-library/react';
import {beforeEach, describe, expect, it} from 'vitest';
import {useAppStore} from './appStore.js';

// Reset store state before each test
beforeEach(() => {
    const store = useAppStore.getState();
    store.logout();
    store.clearAllToasts();
    store.setLoading(false);
    store.clearError();
});

describe('appStore — auth', () => {
    it('sets a token', () => {
        useAppStore.getState().setToken('tok123');
        expect(useAppStore.getState().auth.token).toBe('tok123');
    });

    it('clears token on logout', () => {
        useAppStore.getState().setToken('tok123');
        useAppStore.getState().logout();
        expect(useAppStore.getState().auth.token).toBeNull();
    });

    it('sets a user profile', () => {
        const profile = {actorId: 'u1', name: 'Alice'};
        useAppStore.getState().setProfile(profile);
        expect(useAppStore.getState().auth.profile).toEqual(profile);
    });

    it('sets permissions', () => {
        useAppStore.getState().setPermissions({'portal.design': true, 'user.admin': false});
        expect(
            (useAppStore.getState().auth.permissions as Record<string, boolean>)['portal.design'],
        ).toBe(true);
        expect(
            (useAppStore.getState().auth.permissions as Record<string, boolean>)['user.admin'],
        ).toBe(false);
    });

    it('clears profile and permissions on logout', () => {
        useAppStore.getState().setProfile({actorId: 'u1', name: 'Bob'});
        useAppStore.getState().setPermissions({'portal.design': true});
        useAppStore.getState().logout();
        expect(useAppStore.getState().auth.profile).toBeNull();
        expect(useAppStore.getState().auth.permissions).toEqual({});
    });
});

describe('appStore — portal tabs', () => {
    it('opens a tab', () => {
        const tab = {id: 'tab1', actionName: 'browse', title: 'Browse', params: {}};
        useAppStore.getState().openTab(tab);
        expect(useAppStore.getState().portal.tabs).toHaveLength(1);
        expect(useAppStore.getState().portal.activeTabId).toBe('tab1');
    });

    it('closes a tab', () => {
        useAppStore
            .getState()
            .openTab({id: 'tab1', actionName: 'browse', title: 'Browse', params: {}});
        useAppStore.getState().closeTab('tab1');
        expect(useAppStore.getState().portal.tabs).toHaveLength(0);
    });

    it('activates a different tab when active tab is closed', () => {
        useAppStore.getState().openTab({id: 'tab1', actionName: 'a', title: 'A', params: {}});
        useAppStore.getState().openTab({id: 'tab2', actionName: 'b', title: 'B', params: {}});
        useAppStore.getState().setActiveTab('tab1');
        useAppStore.getState().closeTab('tab1');
        // Another tab should still be accessible
        expect(useAppStore.getState().portal.tabs).toHaveLength(1);
    });

    it('marks a tab as dirty', () => {
        useAppStore.getState().openTab({id: 'tab1', actionName: 'edit', title: 'Edit', params: {}});
        useAppStore.getState().setTabDirty('tab1', true);
        const tab = useAppStore.getState().portal.tabs.find(t => t.id === 'tab1');
        expect(tab?.dirty).toBe(true);
    });

    it('does not exceed max tab count', () => {
        for (let i = 0; i < 20; i++) {
            useAppStore
                .getState()
                .openTab({id: `tab${i}`, actionName: 'a', title: 'A', params: {}});
        }
        // Max tabs limit should have kicked in (10 tabs default)
        expect(useAppStore.getState().portal.tabs.length).toBeLessThanOrEqual(10);
    });
});

describe('appStore — toasts', () => {
    it('adds a toast', () => {
        useAppStore.getState().showToast({severity: 'success', summary: 'Done'});
        expect(useAppStore.getState().toasts).toHaveLength(1);
        expect(useAppStore.getState().toasts[0].severity).toBe('success');
    });

    it('clears a specific toast by ID', () => {
        useAppStore.getState().showToast({severity: 'info', summary: 'Hello'});
        const id = useAppStore.getState().toasts[0].id;
        useAppStore.getState().clearToast(id);
        expect(useAppStore.getState().toasts).toHaveLength(0);
    });

    it('clears all toasts', () => {
        useAppStore.getState().showToast({severity: 'success', summary: 'A'});
        useAppStore.getState().showToast({severity: 'error', summary: 'B'});
        useAppStore.getState().clearAllToasts();
        expect(useAppStore.getState().toasts).toHaveLength(0);
    });
});

describe('appStore — loader', () => {
    it('sets loading active', () => {
        act(() => {
            useAppStore.getState().setLoading(true, 'Loading…');
        });
        expect(useAppStore.getState().loader.active).toBe(true);
        expect(useAppStore.getState().loader.message).toBe('Loading…');
        act(() => {
            useAppStore.getState().setLoading(false);
        });
    });
});

describe('appStore — translations', () => {
    it('sets translations', () => {
        useAppStore
            .getState()
            .setTranslations({'buttons.save': 'Save', 'buttons.cancel': 'Cancel'});
        expect(useAppStore.getState().translations['buttons.save']).toBe('Save');
    });
});

describe('appStore — errors', () => {
    it('shows an error', () => {
        useAppStore.getState().showError({type: 'err.test', message: 'Test error'});
        expect(useAppStore.getState().error?.type).toBe('err.test');
    });

    it('clears the error', () => {
        useAppStore.getState().showError({type: 'err.test', message: 'Test error'});
        useAppStore.getState().clearError();
        expect(useAppStore.getState().error).toBeNull();
    });
});

describe('appStore — actions', () => {
    it('registers actions', () => {
        useAppStore.getState().registerActions({myAction: {method: 'entity.entity.find'} as never});
        expect(useAppStore.getState().actions['myAction']).toBeDefined();
    });
});

describe('appStore — menu config', () => {
    it('sets menu config', () => {
        const config = {name: 'test', title: 'Test', home: ''};
        useAppStore.getState().setPortalConfig(config);
        expect(useAppStore.getState().portal.portalConfig).toEqual(config);
    });

    it('clears menu config', () => {
        useAppStore.getState().setPortalConfig(null);
        expect(useAppStore.getState().portal.portalConfig).toBeNull();
    });
});
