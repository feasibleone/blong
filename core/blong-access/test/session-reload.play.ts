/**
 * Session reload & logout — the reload-skip-login (restore cookie) and
 * logout-then-reload (cookie cleared + session revoked) interactions.
 *
 * Screenshots (baseline via `npm run playwright:update`, verify via
 * `npm run playwright`):
 *   - `reloaded-session.png`    — reload with a live session skips login
 *   - `logged-out-reload.png`   — after logout, reload shows the login screen
 */
import {expect, test} from '@feasibleone/blong-browser/playwright';

test.use({blongPermissions: true});

test.describe('Access session reload & logout', () => {
    test('reload skips the login screen when a live session cookie exists', async ({
        page,
        portal,
    }) => {
        // The portal fixture has already logged in → the restore cookie is set.
        await expect(page.locator('.blong-portal-menubar')).toBeVisible();

        // Reload — the boot-time restore should exchange the cookie for tokens
        // and render the portal directly, WITHOUT the login form.
        await page.reload();
        await expect(page.locator('.blong-portal-menubar')).toBeVisible();
        await expect(page.locator('input[name="username"]')).toHaveCount(0);
        await expect(page).toHaveScreenshot('reloaded-session.png');
    });

    test('logout revokes the session and reload shows the login screen', async ({
        page,
        portal,
    }) => {
        await expect(page.locator('.blong-portal-menubar')).toBeVisible();

        // Logout → server-side revoke + restore-cookie cleared + local state reset.
        await page.getByRole('button', {name: /logout/i}).click();
        await expect(page.locator('input[name="username"]')).toBeVisible();

        // Reload — no cookie → the login screen is shown again.
        await page.reload();
        await expect(page.locator('input[name="username"]')).toBeVisible();
        await expect(page).toHaveScreenshot('logged-out-reload.png');
    });
});
