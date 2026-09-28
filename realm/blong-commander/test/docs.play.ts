/**
 * Documentation images for the commander explorer.
 *
 * `patterns/commander.md` claims that one page explores every backend, and a reader has no picture of
 * that: the claim is a source tree beside a table, and a paragraph cannot show it. The two images
 * here are what settles it — the home view with all eight sources, and one source drilled to show
 * that the table and the viewers are the same ones whatever the backend behind them is.
 *
 * The images are written into `docs/blong/docs/patterns/img/` and nothing is asserted about their
 * bytes: PNG rendering depends on fonts, so a docs image is reviewed rather than byte-compared, for
 * the same reason the regression baselines are generated in CI and never auto-committed (see
 * `core/blong-browser/src/playwright/docs.ts`).
 *
 * The viewport is narrower than the regression specs' 1600×900 on purpose: these pictures are read in
 * a documentation column (703px) and a blog column (633px), and an image is drawn at its own pixel
 * size capped by the column, so a 1600px capture of a desktop page is legible to nobody. 1024px keeps
 * the desktop layout — the commander split view needs the width — while showing the page at roughly
 * two thirds scale in the column it lands in.
 *
 * This spec adds **no** screenshot baseline: the captures are documentation artifacts and are
 * reviewed as such, so the test asserts state and writes files only when asked to.
 *
 * Regenerate with:
 *
 *     BLONG_CAPTURE_DOCS=1 node --run playwright -- test/docs.play.ts
 *
 * Without `BLONG_CAPTURE_DOCS=1` the same spec still runs as a smoke test — it opens the page, waits
 * for the eight sources and drills one of them — and writes no files, so a CI run cannot rewrite a
 * committed picture.
 */
import {expect, test, type Portal} from '@feasibleone/blong-browser/playwright';
import {captureDocs} from '@feasibleone/blong-browser/playwright/docs';

test.use({blongPermissions: true, viewport: {width: 1024, height: 620}});

/** Open the Commander page and wait for the source tree to render every configured source. */
async function openCommander(portal: Portal) {
    await portal.menuClick('commander.browse');
    await expect(portal.page.locator('.blong-commander')).toBeVisible({timeout: 15_000});
    await expect(portal.page.locator('.blong-commander-tree .p-treenode')).toHaveCount(8, {
        timeout: 15_000,
    });
}

/** Select a source in the tree and wait for its branch to arrive. */
async function selectSource(portal: Portal, label: string, expectedText: string) {
    await portal.page
        .locator('.blong-commander-tree .p-treenode-content')
        .filter({hasText: label})
        .first()
        .click();
    await expect(portal.page.locator('.p-datatable-loading-overlay')).toBeHidden({timeout: 15_000});
    await expect(
        portal.page.locator('.p-datatable-tbody tr').filter({hasText: expectedText}).first(),
    ).toBeVisible({timeout: 15_000});
}

test.describe('Commander documentation images', () => {
    test('the source list and one drilled source', async ({portal}) => {
        test.setTimeout(120_000);
        await openCommander(portal);
        await captureDocs(portal, {name: 'patterns/img/commander-sources.png'});

        // The Access DB source is the deterministic one: the access realm's tables are the same in
        // every environment, unlike a Kubernetes namespace or a Redis keyspace some other suite
        // writes to.
        await selectSource(portal, 'Access DB', 'user');
        await captureDocs(portal, {name: 'patterns/img/commander-access-db.png'});
    });
});
