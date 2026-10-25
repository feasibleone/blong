/**
 * Portal — the sport menu is reachable after login and carries the pages.
 *
 * `sport.portal.params` contributes the menu; the portal renders it under the
 * realm's own menubar entry, so the capture is the open Sport menu rather than
 * seven top-level groups.
 */
import {expect, test} from '@feasibleone/blong-browser/playwright';
import {snapshotName} from './sportPlay.js';

test.use({blongPermissions: true});

test('portal carries the sport menu', async ({portal}) => {
    await expect(portal.page.locator('.blong-portal-menubar')).toBeVisible();

    const sportMenu = portal.page.getByRole('menuitem', {name: 'Sport'});
    await expect(sportMenu).toBeVisible();
    await sportMenu.click();

    // The menu lists the pages the realm contributes, grouped.
    await expect(portal.page.getByText('Athletes').first()).toBeVisible();
    await expect(portal.page).toHaveScreenshot(snapshotName('portal-sport-menu.png'));
});
