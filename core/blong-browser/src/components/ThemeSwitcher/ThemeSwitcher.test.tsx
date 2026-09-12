/* spell-checker: disable */
import {userEvent} from '@testing-library/user-event';
import {beforeEach, describe, expect, it} from 'vitest';
import {useAppStore} from '../../state/appStore.js';
import {flushEffects, render} from '../../test/render.js';
import {Theme, type IThemeConfig} from '../Theme/Theme.js';
import {ThemeSwitcher} from './ThemeSwitcher.js';

function renderSwitcher(theme: IThemeConfig = {}) {
    return render(
        <Theme theme={theme}>
            <ThemeSwitcher />
        </Theme>,
    );
}

beforeEach(() => {
    localStorage.removeItem('blong.theme');
    useAppStore.setState(s => ({...s, theme: {}}));
});

function toggle() {
    return document.querySelector('.blong-theme-switcher__mode') as HTMLButtonElement | null;
}

function dropdown() {
    return document.querySelector('.blong-theme-switcher__select') as HTMLElement | null;
}

describe('ThemeSwitcher', () => {
    it('shows the configured theme and hides the toggle for single-variant themes', async () => {
        renderSwitcher({type: 'compact', palette: 'dark'});
        await flushEffects();
        expect(dropdown()?.textContent).toContain('Vela Blue');
        expect(toggle()).toBeNull();
    });

    it('shows a single borderless sun/moon icon toggle for a theme with both variants', async () => {
        renderSwitcher({name: 'lara-blue'});
        await flushEffects();
        expect(dropdown()?.textContent).toContain('Lara Blue');
        const button = toggle();
        expect(button?.tagName).toBe('BUTTON');
        expect(button?.classList.contains('p-button-text')).toBe(true);
        expect(button?.querySelector('.pi-sun')).toBeTruthy();
        expect(button?.getAttribute('aria-label')).toBe('Switch to light mode');
        expect(document.querySelector('.p-selectbutton')).toBeNull();
    });

    it('hides the toggle for the blong glass variant', async () => {
        renderSwitcher({name: 'glass'});
        await flushEffects();
        expect(dropdown()?.textContent).toContain('Glass');
        expect(toggle()).toBeNull();
    });

    it('selects a theme from the dropdown and persists the choice', async () => {
        const user = userEvent.setup();
        renderSwitcher({type: 'compact', palette: 'dark'});
        await flushEffects();

        await user.click(dropdown() as HTMLElement);
        await flushEffects();
        const soho = Array.from(document.querySelectorAll('.p-dropdown-item')).find(el =>
            el.textContent?.includes('Soho'),
        );
        expect(soho, 'Soho option is listed').toBeTruthy();
        await user.click(soho as HTMLElement);
        await flushEffects();

        expect(useAppStore.getState().theme.themeId).toBe('soho');
        expect(useAppStore.getState().theme.palette).toBe('dark');
        expect(JSON.parse(localStorage.getItem('blong.theme') ?? '{}').themeId).toBe('soho');
    });

    it('toggles between light and dark with the icon button', async () => {
        useAppStore.setState(s => ({...s, theme: {themeId: 'lara-blue', palette: 'dark'}}));
        const user = userEvent.setup();
        renderSwitcher();
        await flushEffects();

        await user.click(toggle() as HTMLElement);
        await flushEffects();

        expect(useAppStore.getState().theme).toEqual({themeId: 'lara-blue', palette: 'light'});
        expect(document.querySelector('.blong-app')?.classList.contains('blong-app-light')).toBe(
            true,
        );
        expect(toggle()?.querySelector('.pi-moon')).toBeTruthy();
        expect(toggle()?.getAttribute('aria-label')).toBe('Switch to dark mode');
    });

    it('renders nothing when the switcher is disabled', async () => {
        renderSwitcher({switcher: false});
        await flushEffects();
        expect(document.querySelector('.blong-theme-switcher')).toBeNull();
    });
});
