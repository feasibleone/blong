/**
 * A flow this realm served, drawn from what the run observed.
 *
 * `portalMerge.play.ts` proves the two menus compose. This spec proves the other
 * half of the framework realm being loaded here: the flows this realm itself
 * serves are observable, and one of them can be drawn.
 *
 * The flow is **produced**, not hoped for. Opening the Bundle page is a read this
 * realm answers — the browser asks the gateway, the gateway's dispatch calls the
 * `gateway` namespace, and the realm answers it — and the framework records a
 * proxied call by itself, so the execution carries the hop the drawing is made of.
 * Nothing else in a Playwright run reaches this realm: the login handshake belongs
 * to the login realm (and happens on every deployment), and the flow page's own
 * read is served by the framework realm.
 *
 * Two artifacts come out of one capture, because they answer different
 * questions: the screenshot (`test/observedFlow.play.ts-snapshots/`) proves the
 * browser drew the diagram, and `docs/observedFlows.md` holds the mermaid text a
 * reviewer reads in a diff and a docs site renders. The markdown is written on
 * the first run and compared on every run after that: a test that silently
 * rewrote it would report a diagram change nobody reviewed as a pass. Set
 * `BLONG_REGENERATE_DIAGRAMS=1` to rewrite it deliberately.
 */
import {expect, test} from '@feasibleone/blong-browser/playwright';
import {
    captureDiagram,
    diagramText,
    drawsACall,
} from '@feasibleone/blong-browser/playwright/diagram';

test.use({blongPermissions: true});

/**
 * The kind to draw: a read of this realm's own domain, pinned by name.
 *
 * Pinning is what makes the capture repeat — every request the process serves
 * becomes an execution, so the newest row is whatever page load ran last. The
 * realm's management reads are the right choice over the login handshake that is
 * also observable here: a deployment's own operations are what a realm-specific
 * diagram is for, and the handshake is a flow every deployment has.
 */
const REALM_KIND = 'gateway.bundle.find';

test('a flow this realm served is drawn as a diagram', async ({portal}) => {
    // A DataTable renders its empty state as a row of its own, so a bare `tbody tr` also
    // matches "Nothing observed yet". A data row is the one with an execution cell.
    const rows = portal.page
        .locator('.p-datatable-tbody tr')
        .filter({has: portal.page.locator('[data-testid="flow-execution"]')});
    const pinned = rows.filter({hasText: REALM_KIND}).first();

    // Producing the flow and reading it back is retried as a pair, because the two halves
    // are a race on the *service* rather than on the page: the list is built from the
    // ledger of what has been served, and a read taken moments after a call can come back
    // without it. Measured under the suite's own parallelism: the table still showed
    // "Nothing observed yet" 7s after `gateway.bundle.find` had been served, with no error
    // anywhere — the page had read once, the answer did not contain the row, and nothing
    // in the page reads again. Hence the reload: it is what asks for a second answer.
    //
    // Asking again rather than waiting longer is the point. The row is picked by the kind
    // it names, not by position — the page applies its filter asynchronously *and* the list
    // is live, so the first row is often another spec's execution (measured:
    // `gateway.subscription.find`, from the subscription spec in the same run).
    await expect(async () => {
        await portal.page.reload();
        // Produce the flow: opening the Bundle page is a read this realm answers, so the
        // execution the diagram is drawn from is written by this line.
        await portal.menuClick('gateway.bundle.browse');
        await portal.waitForTableData();
        // Observe it: the framework realm's flow page lists executions by kind.
        await portal.menuClick('blong.flow.browse');
        await portal.waitForTableData();
        // Pinning the kind is what makes the row stable — every request this process
        // serves becomes an execution, and this realm serves its own pages.
        //
        // Addressed by its own label, not by `browse-search`: the portal keeps every
        // opened page mounted (`renderActiveOnly={false}`), so the management page's
        // search box carries the same test id and a test id alone matches two inputs.
        await portal.page.getByRole('textbox', {name: 'Filter'}).fill(REALM_KIND);
        await expect(pinned).toBeVisible({timeout: 5_000});
    }).toPass({timeout: 40_000});

    // Selecting the row is what asks the service for the diagram.
    await pinned.click();
    await expect(portal.page.locator('[data-diagram-rendered]')).toBeVisible();

    // What the service should draw: the hop this realm's answer declared. The
    // framework records a proxied call by itself — the gateway's dispatch declares
    // the method `gateway.bundle.find` for the unit `public`, and the realm answers with a
    // receipt for the same leg — so the arrow exists without the application logging anything.
    //
    // Both ends of the arrow are read off the call, not off the process: the caller is the
    // **logical unit** the declaration names and the receiver is the namespace the method was
    // aimed at. The leg here is `gateway.bundle.find` — the public surface calling the management
    // namespace, which this realm answers as `gateway` — so the drawing has two participants
    // before the realm's own read adds `db` behind the second. The label carries the method
    // alone: the arrow's ends are already on the arrow, and repeating the caller in the label
    // read `public.gateway.bundle.find` between `public` and `gateway`. The caller is named
    // `public` and not `gateway` for its own reason: the surface and the realm's namespace are
    // different units, and one name for both drew them as a single participant with the call as
    // a self-hop. Naming the caller after the process that wrote the record would draw
    // `blong->>gateway`, which is how a monolith collapses to one participant rather than a
    // property of what happened.
    const diagram = await diagramText(portal);
    // A crossed arrow is content, not a failure: "the caller declared a call and
    // nothing answered" is a deployment fact, and a diagram drawn from deductions
    // could not show it. So anything that draws a call is captured - only a diagram
    // with no call in it at all is not (D-209).
    if (drawsACall(diagram)) {
        await captureDiagram(portal, expect, {
            name: 'observed-flow-gateway',
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
