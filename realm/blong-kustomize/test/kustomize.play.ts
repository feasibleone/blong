/**
 * The portal, logged in with a cluster identity (@@D-376); skipped unless `BLONG_TEST_TOKEN` is set.
 */
import {expect, test} from '@feasibleone/blong-browser/playwright';

const token = process.env.BLONG_TEST_TOKEN;

test.skip(!token, 'set BLONG_TEST_TOKEN to a service-account token to log in');

// The realm's login handler ignores the name — the TokenReview answers it — but the form refuses an
// empty one, which is why the app pre-fills it as well.
test.use({blongUsername: 'blong-suite', blongPassword: token ?? ''});

test.describe('Portal', () => {
    test('logs in with a cluster identity', async ({portal}) => {
        await expect(portal.page.locator('.blong-portal-menubar')).toBeVisible();
        await expect(portal.page).toHaveScreenshot('portal-logged-in.png');
    });
});
