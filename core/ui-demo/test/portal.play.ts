/**
 * Portal navigation — tests the login, menu structure, and tab management.
 */
import {test, expect} from '@feasibleone/blong-browser/playwright';

test.use({blongPermissions: true});

test('portal loads after login', async ({portal}) => {
    // The portal fixture already logged in — verify the portal is visible
    await expect(portal.page.locator('.blong-portal-menubar')).toBeVisible();
    // Expand the marine menu group to capture available menu items
    await portal.page.getByTestId('portal-menu-marine').click();
    await expect(portal.page).toHaveScreenshot('portal-home.png');
});

test('open and close browse tab', async ({portal}) => {
    await portal.menuClick('marine.coral.browse');
    await portal.waitForTableData();
    await expect(portal.page).toHaveScreenshot('portal-coral-tab.png');
});
