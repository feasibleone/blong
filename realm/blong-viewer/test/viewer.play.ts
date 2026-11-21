/**
 * `viewer.log` — the portal page, over the records this process wrote.
 *
 * Two things a tap suite cannot show: that the realm's browser layer reaches the
 * portal's menu at all, and that the page a person opens is the standalone
 * viewer rendered against the gateway rather than its own transport (`@@D-946`).
 *
 * The record the page has to show is written by the dev server itself: a served
 * process writes what it emits to `log.destination`, which `index.ts` points at
 * its own listener, so the page has something to read without the test seeding
 * anything. That is why the assertion is on the viewer's own chrome appearing
 * with rows rather than on a row this spec wrote.
 */
import {expect, test} from '@feasibleone/blong-browser/playwright';

test.use({blongPermissions: true});

test('the logs page opens from the menu', async ({portal}) => {
    await portal.menuClick('viewer.log');
    await expect(
        portal.page.getByPlaceholder('Search logs... (Enter to apply)'),
    ).toBeVisible();
});

test('the page shows the records the process wrote', async ({portal}) => {
    await portal.menuClick('viewer.log');
    const grid = portal.page.getByRole('grid');
    await expect(grid).toBeVisible();
    // The header row is the first one, so a served process that wrote nothing
    // would leave the count at one — which is what makes this a test of the
    // records rather than of the table.
    await expect
        .poll(async () => grid.getByRole('row').count(), {timeout: 15_000})
        .toBeGreaterThan(1);
});

/**
 * The page is woken, not polled (`@@D-949`).
 *
 * This is the only test that can tell a subscription from a timer: the tap suite
 * proves the handler and the writer, and the two specs above pass either way. What
 * it exercises is the whole path a browser actually takes — the realm's namespace
 * port, the dispatch to `backend`, the JSON-RPC codec asking for the binary
 * envelope, the HTTP adapter handing back an unread body, the MLE codec agreeing a
 * key from the salt and opening each sealed frame — and it fails at the first link
 * that cannot carry an iterable.
 *
 * The dev server writes records constantly, so the wake arrives on its own; no
 * seed and no poll interval is involved, and the page reports what only the browser
 * can know: that the stream is open and how many wakes it has delivered.
 */
test('the page receives wakes over a stream', async ({portal}) => {
    await portal.menuClick('viewer.log');
    const page = portal.page.locator('[data-stream]');
    await expect(page).toHaveAttribute('data-stream', 'open', {timeout: 15_000});
    await expect
        .poll(async () => Number(await page.getAttribute('data-wakes')), {timeout: 20_000})
        .toBeGreaterThan(0);
});
