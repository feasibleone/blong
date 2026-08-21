import {userEvent} from '@testing-library/user-event';
import {beforeEach, describe, expect, it} from 'vitest';
import {useAppStore} from '../../state/appStore.js';
import {flushEffects, render} from '../../test/render.js';
import {LanguageSwitcher} from './LanguageSwitcher.js';

const portalLanguages = {
    name: 'app',
    title: 'App',
    languages: [
        {value: 'en', label: 'English'},
        {value: 'bg', label: 'Български'},
    ],
    translations: {en: {}, bg: {'Profile': 'Профил'}},
};

beforeEach(() => {
    useAppStore.setState(s => ({
        ...s,
        language: 'en',
        translations: {},
        translationsByLanguage: {en: {}, bg: {'Profile': 'Профил'}},
        auth: {token: 't', profile: null, permissions: {}, isAuthenticated: true},
        portal: {tabs: [], activeTabId: null, portalConfig: null},
    }));
});

describe('LanguageSwitcher', () => {
    it('renders nothing when fewer than two languages are available', () => {
        useAppStore.setState(s => ({
            ...s,
            portal: {
                ...s.portal,
                portalConfig: {
                    name: 'app',
                    title: 'App',
                    languages: [{value: 'en', label: 'English'}],
                },
            },
        }));
        render(<LanguageSwitcher />);
        expect(document.querySelector('.blong-language-switcher')).toBeNull();
    });

    it('reads the language list from the portal config and shows the current language', async () => {
        useAppStore.setState(s => ({
            ...s,
            portal: {...s.portal, portalConfig: portalLanguages},
        }));
        render(<LanguageSwitcher />);
        await flushEffects();
        const dropdown = document.querySelector('.blong-language-switcher');
        expect(dropdown).toBeInTheDocument();
        expect(dropdown?.textContent).toContain('English');
    });

    it('switches the UI language ad-hoc (setLanguage) when an option is selected', async () => {
        useAppStore.setState(s => ({
            ...s,
            portal: {...s.portal, portalConfig: portalLanguages},
        }));
        const user = userEvent.setup();
        render(<LanguageSwitcher />);
        await flushEffects();

        // Open the dropdown and pick Bulgarian.
        await user.click(document.querySelector('.blong-language-switcher') as HTMLElement);
        await flushEffects();
        const bgItem = Array.from(document.querySelectorAll('.p-dropdown-item')).find(el =>
            el.textContent?.includes('Български'),
        );
        expect(bgItem, 'Bulgarian option is listed').toBeTruthy();
        await user.click(bgItem as HTMLElement);
        await flushEffects();

        expect(useAppStore.getState().language).toBe('bg');
        // The active translation dictionary follows the selection.
        expect(useAppStore.getState().translations['Profile']).toBe('Профил');
    });

    it('falls back to the translation-dictionary keys when languages are not configured', async () => {
        useAppStore.setState(s => ({
            ...s,
            portal: {
                ...s.portal,
                portalConfig: {
                    name: 'app',
                    title: 'App',
                    translations: {en: {}, bg: {'Profile': 'Профил'}},
                },
            },
        }));
        render(<LanguageSwitcher />);
        await flushEffects();
        const dropdown = document.querySelector('.blong-language-switcher');
        expect(dropdown).toBeInTheDocument();
        expect(dropdown?.textContent).toContain('en');
    });

    it('lets an explicit prop override the portal config list', async () => {
        useAppStore.setState(s => ({
            ...s,
            portal: {...s.portal, portalConfig: portalLanguages},
        }));
        const user = userEvent.setup();
        render(
            <LanguageSwitcher
                languages={[
                    {value: 'en', label: 'English'},
                    {value: 'de', label: 'Deutsch'},
                ]}
            />,
        );
        await flushEffects();

        await user.click(document.querySelector('.blong-language-switcher') as HTMLElement);
        await flushEffects();
        const deItem = Array.from(document.querySelectorAll('.p-dropdown-item')).find(el =>
            el.textContent?.includes('Deutsch'),
        );
        expect(deItem, 'prop list wins over portal config').toBeTruthy();
    });
});
