/**
 * `access.session` browse-only view — sessions are not editable from the UI.
 * Sessions are created on every login, so the table is populated with live,
 * ever-changing rows (ULIDs + timestamps); asserting a full-page screenshot
 * of the table would be inherently flaky.  Instead we assert the browse page
 * renders and the read-only toolbar button is present.
 */
import {expect, test} from '@feasibleone/blong-browser/playwright';

test.use({blongPermissions: true});

test.describe('Access Session', () => {
    test('browse access session renders with the Close Session toolbar button', async ({
        portal,
    }) => {
        await portal.menuClick('access.session.browse');
        await portal.waitForTableData();
        await expect(portal.page.getByRole('button', {name: 'Close Session'})).toBeVisible();
    });
});
