/**
 * A browse column read from a joined table is filterable.
 *
 * `sport.club`'s Legal Name comes from `party_organization`, and the column filter
 * used to name the profile table instead — `where sport_club.legalName`, which the
 * database rejected, so the page answered with an error dialog rather than a
 * narrowed list (`@@D-743`). No screenshot: the assertion is the table's answer,
 * and a baseline here would only be a picture of a filter row.
 *
 * The club it filters is created here, and the file cleans its own rows first.
 * The production register seed now fills `sport.club` with the real Bulgarian
 * clubs, so the created row is no longer alone on the page: the spec proves the
 * filter narrows *a* list, and it finds its own row through the filter rather
 * than expecting it on the first page. @@D-788
 */
import {expect, test} from '@feasibleone/blong-browser/playwright/shared';
import {cleanupModel, createAndEditModel, quiet} from './sportPlay.js';

test.use({blongPermissions: true});

/** The row this spec owns, so the cleanup removes its own and no one else's. */
const CLUB = 'ENT-PLAY-CF Club';

cleanupModel(test, expect, {
    subject: 'sport',
    object: 'club',
    search: 'ENT-PLAY-CF',
    removeMethod: 'sport.club.remove',
    ...quiet,
});

// A prerequisite for the filter test, not a page of its own: the create still runs
// and its save is asserted, and the pictures belong to the spec that owns the page.
createAndEditModel(test, expect, {
    subject: 'sport',
    object: 'club',
    fields: {
        'club.legalName': CLUB,
        'club.clubShortName': 'ECF',
        'club.clubStatus': {widget: 'select', value: 'Active'},
    },
    search: 'ENT-PLAY-CF',
    ...quiet,
});

test('the Legal Name filter narrows the club list', async ({portal}) => {
    await portal.menuClick('sport.club.browse');
    await portal.waitForTableData();

    const table = portal.page.locator('.p-datatable-tbody');
    // An empty table here is a broken precondition, not a passing filter.
    await expect(table).not.toContainText('No rows.');

    const filter = portal.page.locator('[data-testid$="-filter-legalName"]');
    await expect(filter).toBeVisible();

    // The answer to a filter on the joined column is the matching row, not a
    // dialog — and the row is found by the filter, not by its page position.
    await filter.fill(CLUB);
    await expect(table).toContainText(CLUB);
    await expect(table).not.toContainText('No rows.');
    await expect(portal.page.locator('.blong-error-dialog')).toHaveCount(0);

    // A name no club can have: the same read answers with an empty table.
    await filter.fill('zz-no-such-club');
    await expect(table).toContainText('No rows.');
    await expect(portal.page.locator('.blong-error-dialog')).toHaveCount(0);

    // Cleared, the list is back — the filter narrowed it rather than broke it.
    await filter.fill('');
    await expect(table).not.toContainText('No rows.');
});
