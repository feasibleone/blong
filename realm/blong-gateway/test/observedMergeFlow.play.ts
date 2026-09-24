/**
 * The merge flow this realm serves, drawn from what the run observed.
 *
 * `observedFlow.play.ts` draws a **read** this realm answers — one hop, no
 * instrumentation. This spec draws the management write beside it,
 * `gateway.bundle.merge`, and it is the demonstration the progress-point contract
 * (PRD R26/R27) exists for: the handler announces checkpoints and takes a branch, so
 * the diagram carries notes *and* an alternative, which is the difference between
 * "a call happened" and "here is what the logic was doing".
 *
 * The flow is **produced**, not hoped for. The merge is invoked from the page — the
 * realm contributes a browser subject namespace (`browser/orchestrator/subject/init.ts`),
 * so `gateway.*` resolves bare there — and the gateway records the call it dispatched,
 * by itself. Nothing application-level logs the diagram: the points and the branch are
 * announced by the handler and ride the records the framework was already writing.
 *
 * The bundle is merged **without** a declared `roleBit`, so the run takes the
 * `allocated` branch and the diagram shows the alternative it did not take. Both paths
 * are real: a declared bit is how the meter tests merge their bundles, and the
 * allocation is what a seed's plain `role` map does. Which one a run took is the
 * branch's own record, so the capture does not depend on the answer.
 *
 * Two artifacts come out of one capture, as in the read spec: the screenshot (this
 * file's `-snapshots/` directory) proves the browser drew the diagram, and
 * `docs/observedMergeFlow.md` holds the mermaid text a reviewer reads in a diff.
 * Regenerate it deliberately with `BLONG_REGENERATE_DIAGRAMS=1`.
 */
import {type Portal, expect, test} from '@feasibleone/blong-browser/playwright';
import {
    captureDiagram,
    diagramText,
    drawsACall,
} from '@feasibleone/blong-browser/playwright/diagram';

test.use({blongPermissions: true});

/** The kind to draw: the write this realm answers, pinned by name. */
const REALM_KIND = 'gateway.bundle.merge';

/** The bundle the run merges. Named so the bundle suite's own cleanup removes it. */
const DEMO_BUNDLE = 'Playwright Merge Demo';

/**
 * Ask this realm to merge a bundle — the call the diagram is drawn from.
 *
 * `gatewayBundleMerge` is the browser name of `gateway.bundle.merge`: the portal's
 * adapter resolves it through the realm's subject namespace, and the empty second
 * argument is the `$meta` a page has no business filling in — the dispatch builds the
 * one the handler sees, and attaching the progress-point handles to it is the
 * framework's job, not the caller's.
 */
async function mergeABundle(portal: Portal): Promise<void> {
    const result = await portal.page.evaluate(async () => {
        const handler = (window as unknown as {__blongHandler?: Record<string, unknown>})
            .__blongHandler;
        if (handler === undefined) {
            throw new Error(
                'the page exposed no `__blongHandler`, so the test hook is off: the browser ' +
                    'config did not carry `portal.testHook` for this run (see index.browser.ts). ' +
                    'There is no other way to invoke a management method from the page.',
            );
        }
        const merge = handler['gatewayBundleMerge'] as
            | ((p: object, m: object) => Promise<unknown>)
            | undefined;
        if (typeof merge !== 'function') {
            throw new Error(
                'the handler proxy exposes no `gatewayBundleMerge`; it has: ' +
                    Object.keys(handler).join(', '),
            );
        }
        return merge(
            {
                bundle: {
                    'Playwright Merge Demo': {
                        capability: 'playwright-merge-demo',
                        actions: 'gateway.bundle.find,gateway.bundle.get',
                        baseMonthlyCredits: 250,
                        rateLimit: 25,
                        description: 'Merged by Playwright, to draw the merge',
                    },
                },
            },
            {},
        );
    });
    expect(result, 'the merge reported success').toMatchObject({success: true});
}

test('a checkpoint and a branch are drawn for a flow this realm served', async ({portal}) => {
    // A DataTable renders its empty state as a row of its own, so a bare `tbody tr` also
    // matches "Nothing observed yet". A data row is the one with an execution cell.
    const rows = portal.page
        .locator('.p-datatable-tbody tr')
        .filter({has: portal.page.locator('[data-testid="flow-execution"]')});
    const pinned = rows.filter({hasText: REALM_KIND}).first();

    // Producing the flow and reading it back is retried as a pair, for the reason the read
    // spec documents: the list is built from the ledger of what has been *served*, and a read
    // taken moments after a call can come back without it. Merging again on each attempt is
    // safe — the merge is an ensure, so a second execution says the same thing as the first.
    await expect(async () => {
        await portal.page.reload();
        // The portal must have rendered before the page can call anything: the test hook that
        // exposes `__blongHandler` is installed when the app mounts, so evaluating straight after
        // a reload races the boot and reads `undefined` (the fixture's own specs wait for the
        // menubar for the same reason).
        await expect(portal.page.locator('.blong-portal-menubar')).toBeVisible();
        await mergeABundle(portal);
        await portal.menuClick('blong.flow.browse');
        await portal.waitForTableData();
        // Addressed by its own label: the portal keeps every opened page mounted, so the
        // management pages' search boxes carry the same test id and a test id alone matches
        // more than one input.
        await portal.page.getByRole('textbox', {name: 'Filter'}).fill(REALM_KIND);
        await expect(pinned).toBeVisible({timeout: 5_000});
    }).toPass({timeout: 40_000});

    await pinned.click();
    await expect(portal.page.locator('[data-diagram-rendered]')).toBeVisible();

    const diagram = await diagramText(portal);

    // What must hold today: the flow this realm served is observable, and the hop the realm's
    // answer declared is drawn.
    expect(drawsACall(diagram), 'the diagram draws the merge hop').toBe(true);
    expect(diagram, 'the merge the page asked for is on the drawing').toContain(
        'gateway.bundle.merge',
    );

    if (!drawsACall(diagram)) {
        test.skip(true, 'the service declared no calls for this execution, so there is no hop');
        return;
    }
    await captureDiagram(portal, expect, {
        name: 'observed-merge-flow-gateway',
        artifact: 'docs/observedMergeFlow.md',
        diagram,
    });

    // What the feature adds, and what the receiver's answer exists for: the handler's work is
    // drawn beside the hop it answered. `merge-started` is the first checkpoint the handler
    // announces and the rest follow it, each named by the code that announced it.
    //
    // Before the adapter collected this, all of it was dropped: the records of a call are written
    // by the framework around the handler, so the scope the handler staged into never emitted one
    // (measured: 0 of 5056 retained records carried `progress`). This assertion failed then and
    // passes now, which is why it is here rather than in the framework's own tests alone.
    //
    // And it is drawn over `db`, not over `gateway`: the merge handler is reached across the wire
    // through the realm's db adapter, so the work being reported is the *receiver's*. A note read
    // off the leg alone lands on the caller, which reads as if the caller had done it.
    expect(
        diagram,
        'a checkpoint is drawn as a note, over the participant that announced it',
    ).toMatch(/Note over db: point: merge-started\n/);
    expect(diagram, 'and every phase it announced').toMatch(/Note over db: point: graph-merged\n/);
});

test('the branch the handler took is drawn as an alt block', async ({portal}) => {
    // The second half of the same delivery (PRD R27). A handler's branch is opened and closed
    // inside the handler, so what has to reach the answer is not the *chain* the callee is in
    // (`currentRegions`, empty by then) but the branches it visited — `takeProgress` collects the
    // latter, and it is what this spec exists to prove end to end.
    //
    // The collection has to be installed *before* the handler runs: the boxes it reads are
    // entered with `enterWith`, which reaches the current context and what follows it and never a
    // frame that is already suspended. The handler waits for the db round trip before it decides
    // anything, so a box created on the receiver's side of that wait was invisible to it — the
    // points survived (their box was made by the first checkpoint, before the wait) and the branch
    // mark did not (T-136). With `beginProgress()` called first, both arrive.
    const rows = portal.page
        .locator('.p-datatable-tbody tr')
        .filter({has: portal.page.locator('[data-testid="flow-execution"]')});
    const pinned = rows.filter({hasText: REALM_KIND}).first();
    await portal.menuClick('blong.flow.browse');
    await portal.waitForTableData();
    await portal.page.getByRole('textbox', {name: 'Filter'}).fill(REALM_KIND);
    await expect(pinned).toBeVisible({timeout: 40_000});
    await pinned.click();
    await expect(portal.page.locator('[data-diagram-rendered]')).toBeVisible();

    const diagram = await diagramText(portal);
    expect(diagram, 'the branch is drawn as an alt block').toMatch(/alt role-bit = declared\n/);
    expect(diagram, 'naming the alternative it did not take').toMatch(/else allocated\n/);
    expect(diagram, 'and the point announced inside the taken branch').toMatch(
        /Note over db: point: role-bit-allocated\n/,
    );
});
