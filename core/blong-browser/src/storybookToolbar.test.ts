/**
 * Unit tests for the Storybook toolbar's pure half.
 *
 * What a browser session sees (the toolbar items and the store writes) is
 * covered here; the dev-server half lives in `storybookBackend.ts` and the
 * browser fetch in `storybookSession.ts`.
 */
import {beforeEach, describe, expect, it} from 'vitest';

import {useAppStore} from './state/appStore.js';
import {
    applyStorybookGlobals,
    blongStorybookGlobals,
    blongStorybookGlobalTypes,
    blongStorybookInitialGlobals,
    blongStorybookToolbar,
    STORYBOOK_CHOICES_KEY,
    writeStorybookChoices,
} from './storybookToolbar.js';

const globalsOf = (globalTypes: Record<string, unknown>): string[] => Object.keys(globalTypes);

describe('storybookToolbar — toolbar items', () => {
    beforeEach(() => {
        localStorage.clear();
        delete (globalThis as {__BLONG_STORYBOOK__?: unknown}).__BLONG_STORYBOOK__;
    });

    it('offers the presentation choices without the backend items', () => {
        expect(globalsOf(blongStorybookGlobalTypes())).toEqual(['theme', 'language', 'direction']);
    });

    it('adds backend and role when asked', () => {
        const items = globalsOf(blongStorybookGlobalTypes({backend: true}));
        expect(items).toEqual(['backend', 'role', 'theme', 'language', 'direction']);
        const backend = blongStorybookGlobalTypes({backend: true}).backend as {
            toolbar: {items: {value: string}[]};
        };
        expect(backend.toolbar.items.map(i => i.value)).toEqual(['mock', 'jsonrpc', 'mle']);
    });

    it('lists the roles the dev server injected', () => {
        (globalThis as {__BLONG_STORYBOOK__?: unknown}).__BLONG_STORYBOOK__ = {
            roles: ['Admin', 'Manager'],
        };
        const role = blongStorybookGlobalTypes({backend: true}).role as {
            toolbar: {items: {value: string}[]};
        };
        expect(role.toolbar.items.map(i => i.value)).toEqual(['Admin', 'Manager']);
    });
});

describe('storybookToolbar — initial globals', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('starts mocked, in the default theme, in English and LTR', () => {
        expect(blongStorybookInitialGlobals({backend: true})).toEqual({
            backend: 'mock',
            role: 'Admin',
            theme: 'vela-blue',
            language: 'en',
            direction: 'ltr',
        });
    });

    it('restores the choices a previous session remembered', () => {
        writeStorybookChoices({backend: 'jsonrpc', role: 'Manager', language: 'bg'});
        expect(blongStorybookInitialGlobals({backend: true})).toMatchObject({
            backend: 'jsonrpc',
            role: 'Manager',
            language: 'bg',
        });
    });

    it('prefers the theme the app itself persisted', () => {
        localStorage.setItem('blong.theme', JSON.stringify({themeId: 'glass'}));
        expect(blongStorybookInitialGlobals().theme).toBe('glass');
    });

    it('ignores a remembered role the toolbar no longer offers', () => {
        writeStorybookChoices({role: 'Ghost'});
        expect(blongStorybookInitialGlobals({backend: true, roles: ['Admin']}).role).toBe('Admin');
    });
});

describe('storybookToolbar — reading and applying the globals', () => {
    beforeEach(() => {
        localStorage.clear();
        useAppStore.setState({theme: {}, language: 'en', translations: {}});
    });

    it('maps valid globals and remembers the storybook-only ones', () => {
        const options = blongStorybookGlobals({
            globals: {
                backend: 'mle',
                role: 'Guest',
                theme: 'wood',
                language: 'bg',
                direction: 'rtl',
            },
        });
        expect(options).toEqual({
            backend: 'mle',
            role: 'Guest',
            theme: 'wood',
            language: 'bg',
            direction: 'rtl',
        });
        // theme and direction live in `blong.theme` (the app persists them),
        // so the toolbar's own key holds only what the app does not know.
        expect(JSON.parse(localStorage.getItem(STORYBOOK_CHOICES_KEY)!)).toEqual({
            backend: 'mle',
            role: 'Guest',
            language: 'bg',
        });
    });

    it('ignores unknown values rather than passing them on', () => {
        expect(blongStorybookGlobals({globals: {backend: 'bogus', direction: 'sideways'}})).toEqual(
            {
                backend: undefined,
                role: undefined,
                theme: undefined,
                language: undefined,
                direction: undefined,
            },
        );
    });

    it('applies the theme without dropping the direction beside it', () => {
        useAppStore.setState({theme: {themeId: 'lara-blue', direction: 'rtl'}});
        applyStorybookGlobals(useAppStore.getState(), {theme: 'glass', direction: 'ltr'});
        expect(useAppStore.getState().theme).toEqual({themeId: 'glass', direction: 'ltr'});
        // persisted, so the portal's own switcher agrees with the toolbar
        expect(JSON.parse(localStorage.getItem('blong.theme')!)).toEqual({
            themeId: 'glass',
            direction: 'ltr',
        });
    });

    it('switches the language and leaves an equal value alone', () => {
        applyStorybookGlobals(useAppStore.getState(), {language: 'bg'});
        expect(useAppStore.getState().language).toBe('bg');
        const before = useAppStore.getState().theme;
        applyStorybookGlobals(useAppStore.getState(), {theme: undefined, direction: undefined});
        expect(useAppStore.getState().theme).toBe(before);
    });
});

describe('storybookToolbar — toolbar bundle', () => {
    it('exposes both globalTypes and initialGlobals', () => {
        const toolbar = blongStorybookToolbar({backend: true});
        expect(Object.keys(toolbar)).toEqual(['globalTypes', 'initialGlobals']);
        expect(toolbar.initialGlobals.backend).toBe('mock');
    });
});
