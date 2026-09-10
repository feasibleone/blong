/**
 * Self-service user profile — avatar menu + profile tab (fallback path).
 *
 * The standalone access suite has no party realm, so `profile.person` is null
 * and the page shows the no-personal-data fallback: account line, email,
 * preferred language, roles (read-only) and the change-password section.
 *
 * Screenshots (baseline via `npm run playwright:update`, verify via
 * `npm run playwright`):
 *   - `profile-menu.png`      — the account menu open (avatar visible)
 *   - `profile-open.png`      — the profile tab loaded
 *   - `profile-edit.png`      — email + language edited (dirty)
 *   - `profile-saved.png`     — saved with the success message
 *   - `profile-password.png`  — the change-password form filled in
 *   - `profile-bg.png`        — the profile page rendered in Bulgarian
 *     (preferred language returned at login/restore applied to the UI)
 *
 * The test changes testAdmin's password and then changes it BACK to
 * `testPassword` (still in the same session) so the shared dev DB stays
 * usable by the rest of the suite. Email + language are likewise restored.
 */
import {expect, test} from '@feasibleone/blong-browser/playwright';

test.use({blongPermissions: true});

test.describe('Access user profile', () => {
    test('opens the profile from the account menu, edits details and changes the password', async ({
        page,
        portal,
    }) => {
        test.setTimeout(120_000);

        // The portal fixture has logged in (as testAdmin).
        await expect(page.locator('.blong-portal-menubar')).toBeVisible();

        // Normalise the shared dev DB so screenshots are deterministic
        // regardless of leftover state from earlier runs.
        await page.evaluate(async () => {
            const handler = (window as unknown as {__blongHandler?: Record<string, unknown>})
                .__blongHandler;
            await (handler?.accessProfileEdit as (p: object, m: object) => Promise<unknown>)(
                {emailAddress: 'testAdmin@example.com', preferredLanguage: 'en'},
                {},
            );
        });

        const avatar = page.locator('.blong-account-menu__avatar');
        await expect(avatar).toBeVisible();

        // ── Open the account menu ───────────────────────────────────────────
        await avatar.click();
        const menu = page.locator('.blong-account-menu__menu');
        await expect(menu).toBeVisible();
        await expect(menu.getByText('Profile')).toBeVisible();
        await expect(menu.getByText('Sign out')).toBeVisible();
        await expect(page).toHaveScreenshot('profile-menu.png');

        // ── Open the profile tab ────────────────────────────────────────────
        await menu.locator('.p-menuitem-link', {hasText: 'Profile'}).click();
        const profile = page.locator('.access-profile');
        await expect(profile).toBeVisible();
        const saveButton = profile.getByRole('button', {name: /save/i});
        await expect(saveButton).toBeEnabled();
        // Account line + read-only roles.
        await expect(profile.getByText('testAdmin', {exact: true})).toBeVisible();
        await expect(profile.getByText('Admin', {exact: true})).toBeVisible();
        await expect(page).toHaveScreenshot('profile-open.png');

        // ── Edit email + preferred language, save ───────────────────────────
        await profile.locator('input[name="emailAddress"]').fill('profile@example.com');
        await profile.locator('.p-dropdown').click();
        await page.locator('.p-dropdown-panel .p-dropdown-item', {hasText: 'Български'}).click();
        await expect(page).toHaveScreenshot('profile-edit.png');

        await saveButton.click();
        await expect(profile.locator('.p-inline-message-success')).toBeVisible();
        await expect(page).toHaveScreenshot('profile-saved.png');

        // ── Change password (keep current session) ──────────────────────────
        const passwordCard = profile.locator('.p-card', {hasText: 'Change Password'});
        await passwordCard.locator('input[name="currentPassword"]').fill('testPassword');
        await passwordCard.locator('input[name="newPassword"]').fill('NewPass123!');
        await passwordCard.locator('input[name="confirmPassword"]').fill('NewPass123!');
        await expect(page).toHaveScreenshot('profile-password.png');

        await passwordCard.getByRole('button', {name: /change password/i}).click();
        await expect(passwordCard.locator('.p-inline-message-success')).toBeVisible();

        // The same session is still valid (no forced re-login).
        await expect(profile.getByText('testAdmin', {exact: true})).toBeVisible();

        // ── Restore the original password (shared dev DB stays stable) ──────
        await passwordCard.locator('input[name="currentPassword"]').fill('NewPass123!');
        await passwordCard.locator('input[name="newPassword"]').fill('testPassword');
        await passwordCard.locator('input[name="confirmPassword"]').fill('testPassword');
        await passwordCard.getByRole('button', {name: /change password/i}).click();
        await expect(passwordCard.locator('.p-inline-message-success')).toBeVisible();
        await expect(passwordCard.locator('.p-inline-message-error')).toHaveCount(0);

        // ── Restore email + language ────────────────────────────────────────
        await profile.locator('input[name="emailAddress"]').fill('testAdmin@example.com');
        await profile.locator('.p-dropdown').click();
        await page.locator('.p-dropdown-panel .p-dropdown-item', {hasText: 'English'}).click();
        await saveButton.click();
        await expect(profile.locator('.p-inline-message-success')).toBeVisible();
        await expect(profile.locator('.p-inline-message-error')).toHaveCount(0);

        // Sanity — the restored password still logs in.
        const loginCheck = await page.evaluate(async () => {
            const handler = (window as unknown as {__blongHandler?: Record<string, unknown>})
                .__blongHandler;
            try {
                const result = (await (handler?.loginTokenCreate as (
                    p: object,
                    m: object,
                ) => Promise<{access_token: string}>)(
                    {username: 'testAdmin', password: 'testPassword'},
                    {},
                )) as {access_token?: string};
                return Boolean(result?.access_token);
            } catch {
                return false;
            }
        });
        expect(loginCheck, 'testPassword still logs testAdmin in').toBe(true);
    });

    test('applies the user preferred language at login and renders the profile page in Bulgarian', async ({
        page,
        portal,
    }) => {
        test.setTimeout(120_000);

        // The portal fixture has logged in (as testAdmin).
        await expect(page.locator('.blong-portal-menubar')).toBeVisible();

        // Switch the user's preferred language to Bulgarian (persisted
        // server-side on the user's profile).
        await page.evaluate(async () => {
            const handler = (window as unknown as {__blongHandler?: Record<string, unknown>})
                .__blongHandler;
            await (handler?.accessProfileEdit as (p: object, m: object) => Promise<unknown>)(
                {preferredLanguage: 'bg'},
                {},
            );
        });

        // Reload — the boot-time session restore returns the preferred
        // language, and the app applies it to the UI (locale + translation
        // dictionary) without any further interaction.
        await page.reload();
        await expect(page.locator('.blong-portal-menubar')).toBeVisible();

        // The account menu is now in Bulgarian.
        const avatar = page.locator('.blong-account-menu__avatar');
        await expect(avatar).toBeVisible();
        await avatar.click();
        const menu = page.locator('.blong-account-menu__menu');
        await expect(menu).toBeVisible();
        await expect(menu.getByText('Профил')).toBeVisible();
        await expect(menu.getByText('Отписване')).toBeVisible();

        // Open the profile — the whole page renders in Bulgarian.
        await menu.locator('.p-menuitem-link', {hasText: 'Профил'}).click();
        const profile = page.locator('.access-profile');
        await expect(profile).toBeVisible();
        await expect(profile.getByText('Профил', {exact: true})).toBeVisible();
        await expect(profile.getByText('Предпочитан език', {exact: true})).toBeVisible();
        await expect(profile.getByText('Собствено име', {exact: true})).toBeVisible();
        await expect(profile.getByText('Фамилия', {exact: true})).toBeVisible();
        await expect(profile.getByRole('button', {name: 'Запази'})).toBeVisible();
        await expect(page).toHaveScreenshot('profile-bg.png');

        // Restore the English preference (shared dev DB stays stable).
        await page.evaluate(async () => {
            const handler = (window as unknown as {__blongHandler?: Record<string, unknown>})
                .__blongHandler;
            await (handler?.accessProfileEdit as (p: object, m: object) => Promise<unknown>)(
                {preferredLanguage: 'en'},
                {},
            );
        });
    });
});
