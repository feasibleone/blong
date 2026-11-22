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
    await expect(portal.page.getByPlaceholder('Search logs... (Enter to apply)')).toBeVisible();
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
 * The page is subscribed, not polling (`@@D-949`).
 *
 * This is the only test that can tell a subscription from a timer: the tap suite
 * proves the handler and the writer, and the two specs above pass either way. What
 * it exercises is the whole path a browser actually takes — the realm's namespace
 * port, the dispatch to `backend`, the JSON-RPC codec asking for the binary
 * envelope, the HTTP adapter handing back an unread body, the MLE codec agreeing a
 * key from the salt and opening each sealed frame — and it fails at the first link
 * that cannot carry an iterable.
 *
 * Two things make it deterministic rather than lucky. The stream opens on its own
 * because the gateway writes a keepalive frame before it waits for anything
 * (`@@D-955`) — without it the headers rode on the first record, which a served
 * process writes only when something happens, so the page showed a closed
 * subscription it actually had. And what is asserted is that the subscription is
 * *still* there after the interval the viewer falls back on: a poll would have ended
 * it and reopened it every five seconds, and the closed interval between two
 * subscribes is what this catches.
 *
 * That a *record* wakes the page is the tap group's claim (`test.viewer.flow`: "wakes
 * when a record arrives carrying only a cursor"), because a browser cannot make the
 * process write one — so `data-wakes` stays what the page reports about itself
 * rather than something this spec waits for.
 */
test('the page stays subscribed over a stream', async ({portal}) => {
    await portal.menuClick('viewer.log');
    const page = portal.page.locator('[data-stream]');
    await expect(page).toHaveAttribute('data-stream', 'open', {timeout: 15_000});
    // The viewer polls this often when the stream is not there, so an open subscription
    // has to outlive two of those without ever closing. Sampled rather than slept
    // through: a timer that ended and reopened the subscription leaves a closed
    // interval, and a single late look would step over it.
    const deadline = Date.now() + 6000;
    let samples = 0;
    while (Date.now() < deadline) {
        await expect(page).toHaveAttribute('data-stream', 'open');
        samples += 1;
        await new Promise(resolve => setTimeout(resolve, 250));
    }
    expect(samples).toBeGreaterThan(20);
    await expect(page).not.toHaveAttribute('data-stream-end', /.+/);
});

/**
 * The page draws with the fonts it carries (`@@T-753`).
 *
 * The grid's stylesheet ships the vendor's `@font-face` rules, which point at a CDN; the portal's own
 * stack named `Roboto`, which the portal does not bundle, so naming it made those faces selectable and
 * the browser asked the CDN for six files the deployment's policy refuses. A test rather than a
 * comment because the coupling is invisible: nothing in the page mentions a font, and a stack
 * restored from an older theme brings the requests back with no other change.
 */
test('the page asks no third party for a font', async ({portal}) => {
    const asked: string[] = [];
    const note = (url: string): void => {
        if (/cdn\.svar\.dev|fonts\.(googleapis|gstatic)\.com/.test(url)) asked.push(url);
    };
    portal.page.on('request', request => note(request.url()));
    portal.page.on('requestfailed', request => note(request.url()));
    await portal.menuClick('viewer.log');
    // Text is what resolves a family, so the grid being drawn is when a face would have been fetched.
    await expect(portal.page.getByRole('grid')).toBeVisible();
    await new Promise(resolve => setTimeout(resolve, 1000));
    expect(asked).toEqual([]);
});
