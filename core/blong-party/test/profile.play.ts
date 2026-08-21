/**
 * Self-service user profile — full personal-details path.
 *
 * The blong-party suite has BOTH blong-access and blong-party, so testAdmin is
 * linked (dbTest seed `partyTestProfileMerge`) to a `party.person` via the
 * `hasProfile` edge → the profile page shows personal details and the avatar
 * shows the name initials ("TA").
 *
 * Screenshots (baseline via `npm run playwright:update`, verify via
 * `npm run playwright`):
 *   - `profile-menu.png`     — the account menu open (avatar visible)
 *   - `profile-open.png`     — the profile tab loaded (personal details visible)
 *   - `profile-edit.png`     — name + email + language edited (dirty)
 *   - `profile-saved.png`    — saved with the success message
 *   - `profile-password.png` — the change-password form filled in
 *
 * The test restores the password (testPassword), the name, the email and the
 * language at the end so the shared dev DB stays stable.
 */
import {expect, test} from '@feasibleone/blong-browser/playwright';

test.use({blongPermissions: true});

test.describe('Party user profile', () => {
    test('shows personal details and allows editing the profile and password', async ({
        page,
        portal,
    }) => {
        test.setTimeout(120_000);

        // The portal fixture has logged in (as testAdmin) and rendered the menubar.
        await expect(portal.page.locator('.blong-portal-menubar')).toBeVisible();

        // Normalise the shared dev DB so screenshots are deterministic
        // regardless of leftover state from earlier runs.
        await page.evaluate(async () => {
            const handler = (window as unknown as {__blongHandler?: Record<string, unknown>})
                .__blongHandler;
            await (handler?.accessProfileEdit as (p: object, m: object) => Promise<unknown>)(
                {
                    emailAddress: 'testAdmin@example.com',
                    preferredLanguage: 'en',
                    firstName: 'Test',
                    lastName: 'Admin',
                },
                {},
            );
        });

        // The avatar shows the name initials (Test Admin → TA).
        const avatar = page.locator('.blong-account-menu__avatar');
        await expect(avatar).toBeVisible();
        await expect(avatar).toContainText('TA');

        // ── Open the account menu ───────────────────────────────────────────
        await avatar.click();
        const menu = page.locator('.blong-account-menu__menu');
        await expect(menu).toBeVisible();
        await expect(page).toHaveScreenshot('profile-menu.png');

        // ── Open the profile tab ────────────────────────────────────────────
        await menu.locator('.p-menuitem-link', {hasText: 'Profile'}).click();
        const profile = page.locator('.access-profile');
        await expect(profile).toBeVisible();
        const saveButton = profile.getByRole('button', {name: /save/i});
        await expect(saveButton).toBeEnabled();

        // Personal details from the linked party.person.
        await expect(profile.locator('input[name="firstName"]')).toHaveValue('Test');
        await expect(profile.locator('input[name="lastName"]')).toHaveValue('Admin');
        await expect(profile.locator('input[name="emailAddress"]')).toHaveValue(
            'testAdmin@example.com',
        );
        await expect(profile.getByText('Admin', {exact: true})).toBeVisible();
        await expect(page).toHaveScreenshot('profile-open.png');

        // ── Edit name + email + language, save ──────────────────────────────
        await profile.locator('input[name="firstName"]').fill('Test Edit');
        await profile.locator('input[name="lastName"]').fill('Admin Edited');
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

        // ── Restore the original password ───────────────────────────────────
        await passwordCard.locator('input[name="currentPassword"]').fill('NewPass123!');
        await passwordCard.locator('input[name="newPassword"]').fill('testPassword');
        await passwordCard.locator('input[name="confirmPassword"]').fill('testPassword');
        await passwordCard.getByRole('button', {name: /change password/i}).click();
        await expect(passwordCard.locator('.p-inline-message-success')).toBeVisible();
        await expect(passwordCard.locator('.p-inline-message-error')).toHaveCount(0);

        // ── Restore name + email + language ─────────────────────────────────
        await profile.locator('input[name="firstName"]').fill('Test');
        await profile.locator('input[name="lastName"]').fill('Admin');
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
});
