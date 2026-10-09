/**
 * The portal, logged in with a cluster identity.
 *
 * This realm's login is answered by the cluster (D-376): the password field carries a Kubernetes
 * service-account token, so this spec needs one and skips itself without it:
 *
 *     BLONG_TEST_TOKEN="$(kubectl create token default -n default)" node --run playwright
 *
 * What it proves is what Phase 13 A set out to fix — that the form leads to a rendered page instead
 * of sitting on its own, which is the failure that stopped every browser test before it. The rows
 * themselves come from whatever the cluster holds, so a browse assertion belongs here only once a
 * suite is actually deployed to that cluster (group D); until then this asserts the shell and
 * captures it.
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
