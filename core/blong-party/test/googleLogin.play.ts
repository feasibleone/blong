/**
 * Google social-login flow — Playwright tests with screenshots.
 *
 * The Google side is the lightweight `sim/google` mock (served on port 9082 in
 * the integration intent).  Clicking "Continue with Google" redirects to the
 * mock `/authorize`, which 302s straight back to `/oauth/callback?code=...`;
 * the app exchanges the code and auto-registers/logs in the mock account.
 */
import {expect, test} from '@feasibleone/blong-browser/playwright';

test('google login (mock) auto-registers and lands in the portal', async ({page}) => {
    await page.goto('/');
    await expect(page.getByTestId('login-submit')).toBeVisible();
    await expect(page.getByTestId('google-login-button')).toBeVisible();

    // Click "Continue with Google" → mock /authorize → 302 → /oauth/callback → exchange → portal
    await page.getByTestId('google-login-button').click();
    await expect(page.locator('.blong-portal-menubar')).toBeVisible();
    await expect(page).toHaveScreenshot('google-login-portal.png');
});
