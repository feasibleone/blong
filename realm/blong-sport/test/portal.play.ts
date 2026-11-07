/**
 * Portal — the sport menu is reachable after login and carries the pages.
 *
 * The model aggregator builds the menubar, and the realm's pages are split three
 * ways (`@@D-777`): `Registry` holds the profiles in register order — federations,
 * clubs, athletes, coaches, specialists, affiliations — `Sport` the competition
 * side, and every classifier — sport, discipline, area, cycle, document,
 * award — sits under the shared `Classifiers` root in a `Sport` submenu.
 * Twenty-two pages in one group did not fit a laptop screen.
 *
 * The groups are found by their `data-testid`, not their label: the portal
 * translates a group title, and this suite's test database has the Bulgarian
 * dictionary active (`bgModels.play.ts` sets the language on the same account).
 *
 * The capture is the open `Classifiers` submenu: it is the shape that has no
 * counterpart in the old menu, and the group that has to be found by everybody
 * who fills in a form.
 */
import {expect, test} from '@feasibleone/blong-browser/playwright/shared';
import {snapshotName} from './sportPlay.js';

test.use({blongPermissions: true});

test('portal carries the sport menu', async ({portal}) => {
    await expect(portal.page.locator('.blong-portal-menubar')).toBeVisible();

    const registry = portal.page.locator('[data-testid=portal-menu-registry]');
    const sport = portal.page.locator('[data-testid=portal-menu-sport]');
    const classifiers = portal.page.locator('[data-testid=portal-menu-classifiers]');
    await expect(registry).toBeVisible();
    await expect(sport).toHaveCount(1);
    await expect(classifiers).toBeVisible();

    // The profiles are their own group, in the order the models give them: the
    // federations first, not the alphabetically-first affiliation. Asserted on the
    // leaf test ids, because the labels are translated in this database.
    const registryItem = portal.page.locator(
        'li.p-menuitem:has([data-testid=portal-menu-registry])',
    );
    await registryItem.locator('a').first().click();
    // `.first()`: every entry also carries an empty submenu for its own children.
    const registryList = registryItem.locator('.p-submenu-list').first();
    await expect(registryList).toBeVisible();
    expect(
        await registryList
            .locator('a')
            .evaluateAll(nodes => nodes.map(node => node.getAttribute('data-testid'))),
    ).toEqual([
        'portal-menu-sport-federation-browse',
        'portal-menu-sport-club-browse',
        'portal-menu-sport-athlete-browse',
        'portal-menu-sport-coach-browse',
        'portal-menu-sport-specialist-browse',
        'portal-menu-sport-affiliation-browse',
    ]);
    await expect(
        portal.page.locator('[data-testid=portal-menu-sport-athlete-browse]'),
    ).toBeVisible();

    // Reference data is one level deeper: Classifiers → Sport → the classifiers.
    await classifiers.click();
    const sportSubmenu = portal.page.locator('[data-testid=portal-menu-classifiers-sport]');
    await expect(sportSubmenu).toBeVisible();
    await sportSubmenu.click();
    await expect(
        portal.page.locator('[data-testid=portal-menu-sport-discipline-browse]'),
    ).toBeVisible();

    await expect(portal.page).toHaveScreenshot(snapshotName('portal-sport-menu.png'));
});
