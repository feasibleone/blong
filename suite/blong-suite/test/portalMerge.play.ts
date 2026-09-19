/**
 * Two realms, one portal — the composition proof in the full-stack suite.
 *
 * `marine` contributes a model-driven menu and `blong` answers `portalConfigGet` for
 * its own hand-written pages, so this suite is the case the portal composition
 * exists for (see `core/blong-browser/src/portalConfig.ts`). Before it, the realm
 * loaded last decided the whole menu — here `blong`, which is why marine's pages
 * disappeared from it — and the suite's own configured title was replaced too.
 */
import {expect, test} from '@feasibleone/blong-browser/playwright';

test.use({blongPermissions: true});

test('the suite portal carries both realms’ menus', async ({portal}) => {
    await expect(portal.page.locator('.blong-portal-menubar')).toBeVisible();
    await expect(portal.page.getByTestId('portal-menu-marine')).toBeVisible();
    await expect(portal.page.getByTestId('portal-menu-blong')).toBeVisible();
    // The title the suite configured, kept because the first provider to set one is
    // the model aggregator — which reads that same `ui.portal.portal` slice.
    await expect(portal.page.locator('.blong-portal-brand')).toHaveText('Blong Suite');
    await expect(portal.page.locator('.blong-portal-menubar')).toHaveScreenshot(
        'portal-merged.png',
    );
});

test('a page of each realm opens from the composed menu', async ({portal}) => {
    await portal.menuClick('marine.coral.browse');
    await portal.waitForTableData();
    await portal.menuClick('blong.template.browse');
    await portal.waitForTableData();
    // `:visible` scopes to the open tab: a composed portal keeps every page it has
    // opened in the DOM, so a sibling panel's rows match the plain selector and a
    // hidden one is what `.first()` finds.
    await expect(portal.page.locator('.p-datatable-tbody tr:visible').first()).toBeVisible();
});
