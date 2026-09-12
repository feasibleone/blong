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

describe('ThemeSwitcher', () => {
    it('shows the configured theme and hides the toggle for single-variant themes', async () => {
        renderSwitcher({type: 'compact', palette: 'dark'});
        await flushEffects();
        const dropdown = document.querySelector('.blong-theme-switcher__select');
        expect(dropdown).toBeInTheDocument();
        expect(dropdown?.textContent).toContain('Vela Blue');
        expect(document.querySelector('.blong-theme-switcher__mode')).toBeNull();
    });

    it('shows the light/dark toggle for a theme with both variants', async () => {
        renderSwitcher({name: 'lara-blue'});
        await flushEffects();
        expect(document.querySelector('.blong-theme-switcher__select')?.textContent).toContain(
            'Lara Blue',
        );
        const mode = document.querySelector('.blong-theme-switcher__mode');
        expect(mode).toBeInTheDocument();
        expect(mode?.textContent).toContain('Light');
        expect(mode?.textContent).toContain('Dark');
    });

    it('hides the toggle for the blong glass variant', async () => {
        renderSwitcher({name: 'glass'});
        await flushEffects();
        expect(document.querySelector('.blong-theme-switcher__select')?.textContent).toContain(
            'Glass',
        );
        expect(document.querySelector('.blong-theme-switcher__mode')).toBeNull();
    });

    it('selects a theme from the dropdown and persists the choice', async () => {
        const user = userEvent.setup();
        renderSwitcher({type: 'compact', palette: 'dark'});
        await flushEffects();

        await user.click(document.querySelector('.blong-theme-switcher__select') as HTMLElement);
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

    it('toggles between light and dark for the current theme', async () => {
        useAppStore.setState(s => ({...s, theme: {themeId: 'lara-blue', palette: 'dark'}}));
        const user = userEvent.setup();
        renderSwitcher();
        await flushEffects();

        const light = Array.from(
            document.querySelectorAll('.blong-theme-switcher__mode .p-button'),
        ).find(el => el.textContent?.includes('Light'));
        expect(light).toBeTruthy();
        await user.click(light as HTMLElement);
        await flushEffects();

        expect(useAppStore.getState().theme).toEqual({themeId: 'lara-blue', palette: 'light'});
        expect(
            document.querySelector('.blong-app')?.classList.contains('blong-app-light'),
        ).toBe(true);
    });

    it('renders nothing when the switcher is disabled', async () => {
        renderSwitcher({switcher: false});
        await flushEffects();
        expect(document.querySelector('.blong-theme-switcher')).toBeNull();
    });
});
