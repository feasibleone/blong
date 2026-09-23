/**
 * Documentation images for the RBAC and ACL pages.
 *
 * `patterns/rbac.md` and `patterns/acl.md` describe the model, the seeding and the verdict in prose,
 * and the three surfaces an administrator actually touches are invisible in the docs: the ACL Rules
 * table, the effective-access panel on a role, and the Record Access matrix. That is the whole
 * promise of the record-level ACL — a decision an administrator makes in a tri-state grid — so a
 * picture settles what the paragraphs can only assert.
 *
 * The images are written into `docs/blong/docs/patterns/img/` and nothing is asserted about their
 * bytes: PNG rendering depends on fonts, so a docs image is reviewed rather than byte-compared (see
 * `core/blong-browser/src/playwright/docs.ts`).
 *
 * Regenerate with:
 *
 *     BLONG_CAPTURE_DOCS=1 node --run playwright -- test/docs.play.ts
 *
 * Without `BLONG_CAPTURE_DOCS=1` the same spec still runs as a smoke test — it opens each page and
 * waits for its table — and writes no files, so a CI run cannot rewrite a committed picture.
 *
 * **Nothing here is created or deleted.** Every capture reads the *seeded* `Admin` role and the
 * *seeded* rule set, so the spec cannot drift with whatever the CRUD specs leave behind and needs
 * no cleanup pass.
 *
 * The Record Access matrix on the same role is deliberately **not** captured: for a seeded role its
 * tri-state cells render empty even though the rules exist (the same `Admin`/`(all records)` rules
 * appear in both pictures the spec does take), so a picture of it would read as "no rules".
 * `matrix.play.ts` writes its cells itself and therefore shows them; reproducing that write cycle
 * here is not worth mutating the database for a documentation image.
 */
import {test} from '@feasibleone/blong-browser/playwright';
import {captureDocs} from '@feasibleone/blong-browser/playwright/docs';

test.use({blongPermissions: true});

/** The seed's `Admin` role, matched by its description because that is the column browse searches. */
const ADMIN_DESCRIPTION = 'Admin role with full access';

/**
 * Switch the editor to a master-detail tab by its label. The same selector the CRUD helpers use
 * (`core/blong-browser/src/playwright/model.ts`), reproduced here because this spec navigates
 * rather than drives a model.
 */
async function openTab(page: import('@playwright/test').Page, label: string): Promise<void> {
    await page.locator('.p-tabmenu-nav .p-tabmenuitem').filter({hasText: label}).first().click();
}

test.describe('RBAC and ACL documentation images', () => {
    test('the effective access of the Admin role', async ({portal}) => {
        test.setTimeout(180_000);
        await portal.menuClick('access.role.browse');
        await portal.waitForTableData();

        // Pin the row. The browse search runs against the description column, and the seed's
        // Admin description is unique to this role.
        await portal.page.getByTestId('browse-search').fill(ADMIN_DESCRIPTION);
        await portal.page.waitForTimeout(600);
        await portal.waitForTableData();
        await portal.page
            .locator('.p-datatable-tbody tr')
            .filter({hasNotText: 'No available options'})
            .first()
            .click();
        await portal.page.getByTestId('action-component-access-role-open').first().click();
        await portal.waitForFormLoad();
        await portal.waitForFormData();

        // The Access tab: the effective rules the seed's capability and ACL entries produce — the
        // join the page describes as "the source of each decision".
        await openTab(portal.page, 'Access');
        await portal.waitForTableData();
        await captureDocs(portal, {name: 'patterns/img/access-role-effective.png'});
    });

    test('the ACL rules table', async ({portal}) => {
        test.setTimeout(120_000);
        await portal.menuClick('access.acl.browse');
        await portal.waitForTableData();

        // No filter: the table *is* the shared seed's rule set (the `Admin` wildcard allow on
        // every guarded action, plus whatever other realm seeds contribute), so the whole table
        // is the picture the page needs.
        await captureDocs(portal, {name: 'patterns/img/access-acl-rules.png'});
    });
});
