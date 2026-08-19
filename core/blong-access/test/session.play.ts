/**
 * `access.session` browse-only view — active sessions are not editable from the
 * UI. The table is populated by future session persistence (login currently
 * issues stateless JWTs), so only the Browse page (empty state) plus the
 * presence of the "Close Session" toolbar button are asserted.
 */
import {expect, test} from '@feasibleone/blong-browser/playwright';
import {browseModel} from '@feasibleone/blong-browser/playwright/model';

test.use({blongPermissions: true});

test.describe('Access Session', () => {
    browseModel(test, expect, {
        subject: 'access',
        object: 'session',
    });

    test('close session button is present on the browse toolbar', async ({portal}) => {
        await portal.menuClick('access.session.browse');
        await portal.waitForTableData();
        await expect(portal.page.getByRole('button', {name: 'Close Session'})).toBeVisible();
    });
});
