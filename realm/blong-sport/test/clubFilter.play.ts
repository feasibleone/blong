/**
 * A browse column read from a joined table is filterable.
 *
 * `sport.club`'s Legal Name comes from `party_organization`, and the column filter
 * used to name the profile table instead — `where sport_club.legalName`, which the
 * database rejected, so the page answered with an error dialog rather than a
 * narrowed list (`@@D-743`). No screenshot: the assertion is the table's answer,
 * and a baseline here would only be a picture of a filter row.
 */
import {expect, test} from '@feasibleone/blong-browser/playwright';

test.use({blongPermissions: true});

test('the Legal Name filter narrows the club list', async ({portal}) => {
    await portal.menuClick('sport.club.browse');
    await portal.waitForTableData();

    const filter = portal.page.locator('[data-testid$="-filter-legalName"]');
    await expect(filter).toBeVisible();

    // A name no club can have: the answer is an empty table, not a refusal.
    await filter.fill('zz-no-such-club');
    await expect(portal.page.locator('.p-datatable-tbody')).toContainText('No rows.');
    await expect(portal.page.locator('.blong-error-dialog')).toHaveCount(0);

    // Cleared, the list is back — the filter narrowed it rather than broke it.
    await filter.fill('');
    await expect(portal.page.locator('.p-datatable-tbody')).not.toContainText('No rows.');
    await expect(portal.page.locator('.blong-error-dialog')).toHaveCount(0);
});
