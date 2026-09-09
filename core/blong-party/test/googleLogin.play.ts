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
    await expect(page.getByTestId('login-submit')).toBeVisible({timeout: 15000});
    await expect(page.getByTestId('google-login-button')).toBeVisible({timeout: 10000});

    // "Continue with Google" → mock /authorize → 302 → /oauth/callback → code
    // exchange → portal. On loaded CI runners the round-trip plus Vite
    // on-demand compile can take several seconds, so wait generously instead of
    // relying on Playwright's default 5s expect timeout (the suite already
    // retries once; a longer wait removes most intermittent failures).
    await page.getByTestId('google-login-button').click();
    await expect
        .poll(() => new URL(page.url()).pathname, {timeout: 25000})
        .not.toContain('/oauth/callback');
    await expect(page.locator('.blong-portal-menubar')).toBeVisible({timeout: 25000});
    // Let the portal settle (data fetch + animations) before capturing.
    await page.waitForTimeout(750);
    await expect(page).toHaveScreenshot('google-login-portal.png');
});
