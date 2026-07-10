/**
 * Portal navigation — tests the login, menu structure, and tab management for party realm.
 *
 * Tab screenshots use a search filter to show only seed data, ensuring
 * they remain stable regardless of test execution order (other tests may
 * have created records before these run).
 */
import {expect, test} from '@feasibleone/blong-browser/playwright';

test.use({blongPermissions: true});

test('portal loads after login', async ({portal}) => {
    await expect(portal.page.locator('.blong-portal-menubar')).toBeVisible();
    await portal.page.getByTestId('portal-menu-party').click();
    await expect(portal.page).toHaveScreenshot('portal-home.png');
});

test('open and close person browse tab', async ({portal}) => {
    await portal.menuClick('party.person.browse');
    await portal.waitForTableData();
    // Filter to seed data only — screenshots must be stable across runs
    await portal.page.getByTestId('browse-search').fill('John');
    await portal.page.waitForTimeout(500);
    await portal.waitForTableData();
    await expect(portal.page).toHaveScreenshot('portal-person-tab.png');
});

test('open and close organization browse tab', async ({portal}) => {
    await portal.menuClick('party.organization.browse');
    await portal.waitForTableData();
    // Filter to seed data only — screenshots must be stable across runs
    await portal.page.getByTestId('browse-search').fill('Global Bank');
    await portal.page.waitForTimeout(500);
    await portal.waitForTableData();
    await expect(portal.page).toHaveScreenshot('portal-organization-tab.png');
});
