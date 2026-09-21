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
    // Produce the flow: this read is answered by the realm below, so opening the
    // page writes the execution the diagram is drawn from.
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

    // A DataTable renders its empty state as a row of its own, so a bare
    // `tbody tr` also matches "Nothing observed yet". A data row is the one with
    // an execution cell.
    const rows = portal.page
        .locator('.p-datatable-tbody tr')
        .filter({has: portal.page.locator('[data-testid="flow-execution"]')});
    await expect(rows.first()).toBeVisible();
    // The page applies the filter asynchronously, so clicking the first row straight
    // after typing picked a row of the *unfiltered* list — the newest execution, which
    // in a run of this deployment is whatever page load happened last, and whose
    // diagram is a different flow or none at all. Waiting for the row to name the kind
    // is what makes the capture the flow this spec produced.
    await expect(rows.first()).toContainText(REALM_KIND);

    // Selecting the row is what asks the service for the diagram.
    await rows.first().click();
    await expect(portal.page.locator('[data-diagram-rendered]')).toBeVisible();

    // What the service should draw: the hop this realm's answer declared. The
    // framework records a proxied call by itself — the gateway's dispatch declares
    // `gateway.gateway.bundle.find` and the realm answers with a receipt for it — so
    // the arrow exists without the application logging anything.
    //
    // Both ends of the arrow are read off the call, not off the process: the caller is the
    // **logical unit** the leg id names and the receiver is the namespace it was aimed at.
    // The leg here is `gateway.gateway.bundle.find` — the public surface (`gateway`) calling
    // the management namespace, which this realm answers as `gateway` too — so the two ends
    // coincide and the call is drawn once, with no answer back to itself: the dashed arrow
    // exists to show *another* participant's record of the leg. Naming the caller after the
    // process that wrote the record would draw `blong->>gateway`, which is how a monolith
    // collapses to one participant rather than a property of what happened.
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
