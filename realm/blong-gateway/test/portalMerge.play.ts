/**
 * Two realms, one portal — the composition proof for `portalConfigMerge`.
 *
 * This realm's menu is model-driven; the framework realm answers `portalConfigGet`
 * for its own hand-written pages. A port resolves that method name to a single
 * function — the newest group shadows the earlier ones — so loading the framework
 * realm here used to replace this realm's menu outright, and every one of this
 * package's own specs timed out waiting for `portal-menu-gateway`. The shell now
 * asks `portalConfigMerge`, which asks every provider and composes the answers.
 *
 * So this spec is the cross-realm evidence: both menus render, the framework realm's
 * page opens from the composed menu, and this package's own specs (which assert
 * `portal-menu-gateway`) still pass beside them.
 */
import {expect, test} from '@feasibleone/blong-browser/playwright';

test.use({blongPermissions: true});

test('both realms contribute their menu to one portal', async ({portal}) => {
    await expect(portal.page.locator('.blong-portal-menubar')).toBeVisible();
    await expect(portal.page.getByTestId('portal-menu-gateway')).toBeVisible();
    await expect(portal.page.getByTestId('portal-menu-blong')).toBeVisible();
    // The suite configures its own title, and the first provider to set one is the
    // model aggregator — reading that same `ui.portal.portal` slice.
    await expect(portal.page.locator('.blong-portal-brand')).toHaveText('Blong Gateway');
    await expect(portal.page.locator('.blong-portal-menubar')).toHaveScreenshot(
        'portal-merged.png',
    );
});

test('a page of the framework realm opens from the composed menu', async ({portal}) => {
    await portal.menuClick('blong.template.browse');
    await portal.waitForTableData();
    // `:visible` scopes to the open tab: a composed portal keeps the pages it has
    // opened in the DOM, so a sibling panel's rows match the plain selector and a
    // hidden one is what `.first()` would find.
    await expect(portal.page.locator('.p-datatable-tbody tr:visible').first()).toBeVisible();
});
