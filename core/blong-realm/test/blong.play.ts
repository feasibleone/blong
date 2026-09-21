import {expect, test} from '@feasibleone/blong-browser/playwright';
import {
    captureDiagram,
    diagramText,
    drawsACall,
} from '@feasibleone/blong-browser/playwright/diagram';
import {openPages} from '@feasibleone/blong-browser/playwright/pages';

/**
 * The kind this realm's own page read produces, and the flow the capture draws.
 *
 * Pinned rather than "whatever was observed last": every request this process serves
 * becomes an execution, so the newest row is whichever page load ran last, and a
 * diagram of that is not an artifact anyone can compare between runs (F-194). This
 * read is served **by this realm** — the page asks the gateway, the gateway
 * dispatches to the `blong` namespace, and this realm answers — so the diagram is
 * this realm's own flow and the hop that served it is its one arrow.
 *
 * Both ends of that arrow are read off the call, not off the deployment: the caller is the
 * **logical unit** the leg id names — `public`, the surface that received the request — and the
 * receiver is the namespace it was aimed at, `blong`. So this deployment draws two
 * participants, and the hop the artifact exists to show is visible. Naming either end after the
 * process that wrote the record would collapse a monolith to one participant, which is a
 * property of how a suite is split rather than of what happened.
 */
const REALM_KIND = 'blong.flow.find';

/**
 * The five pages, opened the way a person opens them.
 *
 * These are the only tests that exercise the whole path: a real browser session,
 * the gateway's authorization, the realm's read, the service behind it, and the
 * React page that shows the answer. Everything else in this realm is asserted in
 * process, where none of those parts exist.
 *
 * Two of them are worth more than the others:
 *
 * - the diagram, which is drawn by mermaid in the browser from the text the
 *   service sent — a page that lists flows and then draws nothing looks exactly
 *   like a page with no flows;
 * - the refusal, which is what a role without the realm's capability gets. A
 *   missing grant would otherwise be invisible: the pages would simply be empty.
 */

/** The five reads, as the portal menu names them. */
openPages(test, expect, {
    methods: [
        // Each list is pinned to a subset that repeats between runs, and the cells
        // that cannot repeat (a minted execution id, a wall clock) are masked. The
        // alternative is a capture that drifts with whatever the run observed, which
        // is how six screenshots showing error dialogs passed for green.
        // The flow list is real now, and it is the one page whose row *count* is not
        // stable: every request this process serves becomes an execution, so a run
        // that opens the page lists a different set each time. Pinning the kind is
        // what makes the capture repeat — these two are the login handshake every
        // run performs — while the minted id stays masked.
        {
            method: 'blong.flow.browse',
            searchText: 'login.token',
            mask: ['[data-testid="flow-execution"]'],
        },
        {method: 'blong.template.browse', searchText: 'error'},
        // The search page has no table until a query is typed, so there is nothing
        // for the table wait to find; the capture is what proves it rendered.
        {method: 'blong.search.browse', waitForTableData: false},
        {
            method: 'blong.digest.browse',
            searchText: 'template',
            // The digest grows while a run is in progress, so the number of rows is
            // not stable even once the kind is pinned. The first row is: it is the
            // newest change of that kind, which is the row the page exists to show.
            region: '.p-datatable-tbody tr:first-child',
            mask: ['[data-testid="digest-when"]'],
        },
        'blong.incident.browse',
    ],
    screenshot: method => `blong-${method.split('.')[1]}.png`,
});

test('an observed execution is drawn as a diagram', async ({portal}) => {
    // This one test needs more than the realm's deliberately tight 20s budget: the
    // assertion below waits for mermaid's lazily loaded chunk, which is cold on a
    // first run, and an assertion can never outlive the test that contains it.
    test.setTimeout(90_000);
    await portal.menuClick('blong.flow.browse');
    await portal.waitForTableData();

    // Pin the kind before reading the rows. Addressed by its own label rather than by
    // `browse-search`: the portal keeps every opened page mounted
    // (`renderActiveOnly={false}`), so a test id alone can match two inputs.
    await portal.page.getByRole('textbox', {name: 'Filter'}).fill(REALM_KIND);

    // The run's own logging is what the service has observed, so by the time a
    // page is open there is usually an execution to draw. When there is not, the
    // page has to say so rather than show a blank panel — both are asserted, and
    // the second is the one a rendering regression would break.
    // A DataTable renders its empty state as a row of its own, so a bare `tbody tr`
    // matches it — which is how this test spent a while clicking "Nothing observed
    // yet" and reporting that no diagram appeared. A data row is recognised by the
    // execution cell it renders (the same testid the captures mask), which is exact;
    // excluding the empty state by its text or class is a guess that reads the same
    // whether it is right or wrong.
    const dataRows = portal.page
        .locator('.p-datatable-tbody tr')
        .filter({has: portal.page.locator('[data-testid="flow-execution"]')});

    // A row has to be the kind this capture is about before it is clicked: the page
    // applies the filter asynchronously, and the first row of the *unfiltered* list is
    // whatever execution ran last — a probe or a page load, whose diagram is a
    // participant and no arrows.
    await expect(dataRows.first()).toContainText(REALM_KIND);

    if ((await dataRows.count()) === 0) {
        // Nothing of this kind has been observed, so there is no execution to draw, and
        // the page has to say so rather than show a blank panel.
        await expect(portal.page.locator('.p-datatable-tbody tr').first()).toBeVisible();
        return;
    }

    const first = dataRows.first();
    const rowText = await first.innerText();
    // The list refreshes on a timer, so a plain click never sees the row "stable"
    // and retries until the test times out.
    await first.click({force: true});
    // Three states can follow a selection — drawn, still loading, or the text as it
    // came because mermaid refused it — and any of them proves the selection reached
    // the viewer. Only "nothing at all" is a failure, and saying so with the page's
    // own text is the difference between a diagnosis and a guess.
    const viewer = portal.page.locator(
        '[data-diagram-rendered], [data-diagram-pending], [data-diagram-fallback]',
    );
    try {
        await viewer.first().waitFor({state: 'attached', timeout: 30_000});
    } catch {
        throw new Error(
            `selecting ${rowText} left no diagram element at all.\n` +
                `page text:\n${await portal.page.locator('body').innerText()}\n` +
                `browser errors:\n${portal.browserErrors.join('\n')}`,
        );
    }
    // And the diagram itself: mermaid's chunk is cold on a first run, which is more
    // than the suite's deliberately short element budget allows for.
    await expect(portal.page.locator('[data-diagram-rendered]')).toBeVisible({timeout: 30_000});

    // A long sequence is taller than any screen and the list of executions is as long as
    // the process has been up, so each is given a box of its own that scrolls: the page
    // never outgrows the panel, and what does not fit stays reachable. That is the bug this
    // asserts against — the panel clipped the page at `overflow: hidden` and nothing
    // anywhere scrolled (measured: 20187px of page in a 670px panel, so everything below
    // the fold of either the list or the diagram was simply unreachable). A page that fits
    // is also what keeps a capture of it comparable between runs, which is why the panel is
    // asserted *not* to scroll.
    const layout = await portal.page.evaluate(() => {
        const box = (testId: string): {overflow: string} => {
            const element = document.querySelector(`[data-testid="${testId}"]`);
            return {overflow: element === null ? 'absent' : getComputedStyle(element).overflowY};
        };
        const panel = document.querySelector('.p-tabview-panel');
        return {
            executions: box('flow-executions'),
            diagram: box('flow-diagram'),
            pageOverflows: panel !== null && panel.scrollHeight > panel.clientHeight,
        };
    });
    expect(layout.executions.overflow, 'the list of executions scrolls in its own box').toBe(
        'auto',
    );
    expect(layout.diagram.overflow, 'the diagram scrolls in its own box').toBe('auto');
    expect(layout.pageOverflows, 'and the page fits the panel it was given').toBe(false);

    // The same policy as `realm/blong-gateway/test/observedFlow.play.ts`, through the
    // same helper: capture the screenshot and the mermaid text when a call was
    // actually drawn, and say why when none was (D-209). A participant-only diagram
    // proves the page rendered and nothing else, so committing it would record a
    // flow nobody called - worse than no artifact at all. Both arrow styles count:
    // `->>` is an answered call and `--x` is one nothing answered, and the second is
    // content rather than a failure.
    const diagram = await diagramText(portal);
    if (drawsACall(diagram)) {
        await captureDiagram(portal, expect, {
            name: 'observed-flow-realm',
            artifact: 'docs/observedFlows.md',
            diagram,
        });
        return;
    }
    test.skip(
        true,
        'the service declared no calls for this execution, so there is no hop to draw; ' +
            'the diagram rendered with ' +
            JSON.stringify(diagram.split('\n'))[0],
    );
});

// The realm's test seed grants `blongRealmRead` to `Admin`; `testViewer` holds
// `Customer`, which has nothing from this realm. The gateway refuses the method
// before the realm sees it, which is the behaviour a deployment depends on and the
// one a missing grant would hide.
//
// The credentials go through `test.use`: the `portal` fixture logs in itself, so
// calling `portal.login` again looks for a login form a logged-in portal no longer
// shows — which is what a first attempt at this test did.
test.describe('a role without the capability', () => {
    test.use({blongUsername: 'testViewer', blongPassword: 'testPassword'});

    test('is refused, not shown an empty page', async ({portal}) => {
        await portal.menuClick('blong.flow.browse');
        await expect(portal.page).toHaveScreenshot('blong-refused.png');
        // The *reason* matters as much as the refusal: an unrouted method answers
        // "Not Found", which looks identical in a screenshot. This realm passed
        // this test for a while with its entire API missing from the gateway.
        // Polled rather than read once: the console error carrying the reason
        // arrives after the click that caused it, so a single read races the browser
        // — and an empty list is indistinguishable from a call that was never made.
        await expect
            .poll(() => portal.browserErrors.join('\n'), {timeout: 10_000})
            .toMatch(/Authorization denied.*blong\.flow\.find/);
    });
});
