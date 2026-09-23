/**
 * Documentation images for the model-system pages.
 *
 * These pages exist to be **photographed**. `patterns/blong-model.md` and
 * `concepts/editor-features.md` describe Browse, New and Open pages in prose, and a reader has no
 * picture of any of them — the model system's whole promise is that a realm gets those pages
 * without writing UI, which is a claim a screenshot settles and a paragraph does not.
 *
 * The images are written into `docs/blong/docs/patterns/img/` and nothing is asserted about their
 * bytes: PNG rendering depends on fonts, so a docs image is reviewed rather than byte-compared,
 * for the same reason the regression baselines are generated in CI and never auto-committed (see
 * `core/blong-browser/src/playwright/docs.ts`).
 *
 * `docsOnly: true` keeps this spec out of the baseline corpus. Every page here is already guarded
 * by `coral.play.ts`, `family.play.ts`, `habitat.play.ts` and `species.play.ts`, so a second
 * snapshot of each would be a regression check nobody asked to maintain.
 *
 * Regenerate with:
 *
 *     BLONG_CAPTURE_DOCS=1 node --run playwright -- test/docs.play.ts
 *
 * Without `BLONG_CAPTURE_DOCS=1` the same spec still runs as a smoke test — it opens each page and
 * waits for its table — and writes no files, so a CI run cannot rewrite a committed picture.
 */
import {expect, test} from '@feasibleone/blong-browser/playwright';
import {captureDocs} from '@feasibleone/blong-browser/playwright/docs';
import {openPages} from '@feasibleone/blong-browser/playwright/pages';

test.use({blongPermissions: true, viewport: {width: 1600, height: 700}});

test.describe('Marine documentation images', () => {
    openPages(test, expect, {
        docsOnly: true,
        methods: [
            // Coral carries every widget type, so it is the page that shows what the model
            // system generates from a rich spec.
            {method: 'marine.coral.browse', searchText: 'Staghorn'},
            // Species is the plainest entity, which is what a reader wants when comparing the
            // generated page against the spec in the pattern doc.
            {method: 'marine.species.browse'},
            {method: 'marine.habitat.browse'},
        ],
        // `marine.coral.browse` → `patterns/img/marine-coral-browse.png`, beside the page that
        // shows it, so `./img/…` resolves in the source viewer as well as in the built site.
        docs: method => `patterns/img/${method.replace(/\./g, '-')}.png`,
    });
});

/**
 * The Editor in the two states `concepts/editor-features.md` describes in prose and has never shown:
 * a new, empty form, and one loaded with a record.
 *
 * Both are reached the way a user reaches them — the browse page's Create action, and a row opened
 * with the Edit action — using the same `data-testid`s the CRUD helpers use, so the capture follows
 * the product instead of a second, hand-written set of selectors that could drift from it.
 */
test.describe('Editor documentation images', () => {
    test('the Editor empty and open', async ({portal}) => {
        test.setTimeout(120_000);
        await portal.menuClick('marine.coral.browse');
        await portal.waitForTableData();

        const create = portal.page.getByTestId('action-component-marine-coral-new').first();
        await create.waitFor({state: 'visible'});
        await create.click();
        await portal.waitForFormLoad();
        await captureDocs(portal, {name: 'concepts/img/editor-new-empty.png'});

        // Back to the table, then open a known row so the picture is the same record every run.
        await portal.menuClick('marine.coral.browse');
        await portal.waitForTableData();
        await portal.page.getByTestId('browse-search').fill('Staghorn');
        await portal.page.waitForTimeout(600);
        await portal.waitForTableData();

        await portal.page
            .locator('.p-datatable-tbody tr')
            .filter({hasNotText: 'No available options'})
            .first()
            .click();
        await portal.page.getByTestId('action-component-marine-coral-open').first().click();
        await portal.waitForFormLoad();
        await portal.waitForFormData();
        await captureDocs(portal, {name: 'concepts/img/editor-open.png'});
    });
});

/**
 * The portal shell itself — the frame `concepts/browser-ui.md` describes and no picture showed:
 * the menubar a realm contributes a group to, and the tab strip of open pages.
 *
 * Two pages are opened first, because one tab says nothing about a tab strip, and the picture is
 * the whole viewport: the point of this one is the relationship between the frame and the page
 * inside it, which a clipped region would cut apart.
 */
test.describe('Portal documentation images', () => {
    test('the portal shell with two pages open', async ({portal}) => {
        test.setTimeout(120_000);
        await portal.menuClick('marine.coral.browse');
        await portal.waitForTableData();
        await portal.menuClick('marine.habitat.browse');
        await portal.waitForTableData();
        // Back to the first tab, so the page in the frame is the one with rows in it — a picture
        // of a tab strip whose visible page is still loading says the wrong thing about the shell.
        await portal.page.locator('.p-tabview-nav li').first().click();
        await portal.waitForTableData();
        await portal.page.locator('.p-datatable-tbody tr').first().waitFor({state: 'visible'});
        await captureDocs(portal, {name: 'concepts/img/portal-shell.png'});
    });
});

/**
 * The page a model gets for free when its spec declares `report` — the third generated page,
 * beside Browse and Editor, and the one `patterns/blong-model.md` documents without showing.
 *
 * The Report action is a toolbar button, so no row has to be selected first; the page opens on
 * the whole table the same way a user reaches it.
 */
test.describe('Report documentation images', () => {
    test('the generated report page', async ({portal}) => {
        test.setTimeout(120_000);
        await portal.menuClick('marine.coral.browse');
        await portal.waitForTableData();

        const report = portal.page.getByTestId('action-component-marine-coral-report').first();
        await report.waitFor({state: 'visible'});
        await report.click();
        await portal.waitForFormLoad();

        // The generated report runs unfiltered and its params card is not editable (the filter
        // field is read-only), so the picture is the whole table as the demo database holds it —
        // row residue from the regression specs included. Narrowing a generated report from its
        // own params card is recorded as unfinished work rather than papered over here.
        await portal.waitForTableData();
        await captureDocs(portal, {name: 'patterns/img/marine-coral-report.png'});
    });
});
