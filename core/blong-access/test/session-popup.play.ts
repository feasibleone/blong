/**
 * Session expiry → login popup → re-login.
 *
 * Deterministic trigger: after login the test revokes the server-side session
 * via `login.token.revoke` (through the app's own handler), waits for the
 * short test access-token TTL (30s) to elapse, then triggers a direct
 * protected call.  The codec attempts renewal → the session is revoked →
 * renewal is refused → 401 → the login popup appears.  After logging in
 * through the popup the same operation succeeds again.
 *
 * Screenshots (baseline via `npm run playwright:update`, verify via
 * `npm run playwright`):
 *   - `login-popup.png`   — the login popup after a revoked/expired session
 *   - `re-login-save.png` — the operation succeeds after re-login
 */
import {expect, test} from '@feasibleone/blong-browser/playwright';

test.use({blongPermissions: true});

test.describe('Access session login popup', () => {
    test('expired session shows the login popup and re-login recovers', async ({
        page,
        portal,
    }) => {
        test.setTimeout(120_000);

        // The portal fixture has logged in (session created + cookie set).
        await expect(page.locator('.blong-portal-menubar')).toBeVisible();

        // Revoke the server-side session WITHOUT clearing the local auth state.
        // `login.token.revoke` resolves through the portal/backend adapter via
        // blong-login's browser subject namespace (no `backend/` prefix needed).
        await page.evaluate(async () => {
            const handler = (window as unknown as {__blongHandler?: Record<string, unknown>})
                .__blongHandler;
            await (handler?.loginTokenRevoke as (p: object, m: object) => Promise<unknown>)(
                {},
                {},
            );
        });

        // Let the access token expire — the codec renews a few seconds before
        // expiry, so after this wait the next request attempts a renewal.
        await page.waitForTimeout(26_000);

        // Trigger a protected call → renewal refused (session revoked) → 401 →
        // login popup.
        await page.evaluate(async () => {
            const handler = (window as unknown as {__blongHandler?: Record<string, unknown>})
                .__blongHandler;
            try {
                await (handler?.accessUserFind as (p: object, m: object) => Promise<unknown>)(
                    {paging: {}},
                    {},
                );
            } catch {
                // 401 expected — the popup is asserted below.
            }
        });
        await expect(page.locator('.blong-login-popup')).toBeVisible();
        await expect(page).toHaveScreenshot('login-popup.png');

        // Re-login through the popup.
        await page.fill('.blong-login-popup input[name="username"]', 'testAdmin');
        await page.fill('.blong-login-popup input[name="password"]', 'testPassword');
        await page.locator('.blong-login-popup').getByRole('button', {name: /login/i}).click();

        // Popup closes and the portal is back; the operation now succeeds.
        await expect(page.locator('.blong-login-popup')).toHaveCount(0);
        await expect(page.locator('.blong-portal-menubar')).toBeVisible();
        const result = await page.evaluate(async () => {
            const handler = (window as unknown as {__blongHandler?: Record<string, unknown>})
                .__blongHandler;
            return (await (handler?.accessUserFind as (
                p: object,
                m: object,
            ) => Promise<unknown>)({paging: {}}, {})) as unknown;
        });
        expect(Array.isArray(result), 'protected call succeeds after re-login').toBe(true);
        await expect(page).toHaveScreenshot('re-login-save.png');
    });
});
