/**
 * Portal language switcher — ad-hoc UI language switching from the menubar.
 *
 * The language switcher renders to the left of the profile menu (config-driven
 * via `portal.languages`).  Selecting a language switches the UI immediately
 * (client-side `setLanguage` — the choice is NOT persisted to the user
 * profile; that is the profile page's preferred-language edit).
 *
 * Screenshots (baseline via `npm run playwright:update`, verify via
 * `npm run playwright`):
 *   - `language-switch-closed.png` — the switcher in the menubar (English)
 *   - `language-switch-open.png`   — the language list open
 *   - `language-switch-bg.png`     — the UI switched to Bulgarian
 */
import {expect, test} from '@feasibleone/blong-browser/playwright';

test.use({blongPermissions: true});

test.describe('Portal language switcher', () => {
    test('switches the UI language ad-hoc from the menubar', async ({page, portal}) => {
        test.setTimeout(120_000);

        // The portal fixture has logged in (as testAdmin).
        await expect(page.locator('.blong-portal-menubar')).toBeVisible();

        // The menubar shows the language switcher to the left of the account menu.
        const switcher = page.locator('.blong-language-switcher');
        const switcherLabel = page.locator('.blong-language-switcher .p-dropdown-label');
        await expect(switcher).toBeVisible();
        await expect(switcherLabel).toHaveText('English');
        await expect(page).toHaveScreenshot('language-switch-closed.png');

        // Open it — the configurable language list appears.
        await switcher.click();
        await expect(page.locator('.p-dropdown-panel')).toBeVisible();
        await expect(page.locator('.p-dropdown-item', {hasText: 'English'})).toBeVisible();
        await expect(page.locator('.p-dropdown-item', {hasText: 'Български'})).toBeVisible();
        await expect(page).toHaveScreenshot('language-switch-open.png');

        // Pick Bulgarian — the UI switches immediately.
        await page.locator('.p-dropdown-item', {hasText: 'Български'}).click();
        await expect(switcherLabel).toHaveText('Български');

        // The account menu now renders in Bulgarian.
        const avatar = page.locator('.blong-account-menu__avatar');
        await expect(avatar).toBeVisible();
        await avatar.click();
        const menu = page.locator('.blong-account-menu__menu');
        await expect(menu).toBeVisible();
        await expect(menu.getByText('Профил')).toBeVisible();
        await expect(menu.getByText('Отписване')).toBeVisible();
        await expect(page).toHaveScreenshot('language-switch-bg.png');

        // Close the menu, then switch back to English (ad-hoc — no persistence).
        await page.keyboard.press('Escape');
        await expect(menu).toBeHidden();
        await switcher.click();
        await page.locator('.p-dropdown-item', {hasText: 'English'}).click();
        await expect(switcherLabel).toHaveText('English');

        // The account menu is English again.
        await avatar.click();
        await expect(menu.getByText('Profile')).toBeVisible();
        await expect(menu.getByText('Sign out')).toBeVisible();
    });
});
