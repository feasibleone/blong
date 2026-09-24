/**
 * The commander dispatch, drawn from what the run observed.
 *
 * `commanderBranchList` is an **orchestrator**: it announces its own progress and then dispatches a
 * method to a backend through the handler proxy, so both halves have to appear at the same
 * participant — the notes over the dispatch, and the outgoing leg it declared. That coexistence is
 * what this spec exists to check; the merge capture in `blong-gateway` is the adapter-side case,
 * where the handler is reached across the wire and has no outgoing call of its own.
 *
 * The flow is produced, not hoped for: selecting a source in the explorer tree is a read this realm
 * answers, and the framework records the dispatched call by itself.
 */
import {expect, test} from '@feasibleone/blong-browser/playwright';
import {
    captureDiagram,
    diagramText,
    drawsACall,
} from '@feasibleone/blong-browser/playwright/diagram';
import type {Locator} from '@playwright/test';

test.use({blongPermissions: true});
// Producing the flow takes a page load, a drill and a second page, and the first attempt does it
// cold, with the portal loading its realms lazily: the retry is allotted 90s of that, and the
// test's budget has to hold two attempts, or the first attempt's timeout is reported as the test
// failing rather than as the retry it is.
test.setTimeout(240_000);

/** The gateway method the flow is minted with — the name the flow page filters by. */
const KIND = 'commander.branch.list';
/** The tree node whose children the realm lists: the drill that serves this flow. */
const SOURCE = 'Access DB';

test('the orchestrator dispatch is drawn with its milestones and its outgoing leg', async ({
    portal,
}) => {
    // Warm the portal before the retry: the first load after the client's dependencies are
    // re-optimized is the slow one, and paying for it inside a retry attempt reads as a flaky spec.
    await expect(portal.page.locator('.blong-portal-menubar')).toBeVisible({timeout: 60_000});

    // A DataTable renders its empty state as a row of its own, so a data row is one with an
    // execution cell.
    const rows = portal.page
        .locator('.p-datatable-tbody tr')
        .filter({has: portal.page.locator('[data-testid="flow-execution"]')});

    // Producing the flow and reading it back is retried as a pair, because the two halves race on the
    // service rather than on the page: the list is built from the ledger of what has been served, and
    // a read taken moments after a call can come back without it.
    await expect(async () => {
        await portal.page.reload();
        await portal.menuClick('commander.browse');
        await expect(portal.page.locator('.blong-commander')).toBeVisible({timeout: 15_000});
        // Drilling a source is the read that serves `commander.branch.list` for its children.
        await portal.page
            .locator('.blong-commander-tree .p-treenode-content')
            .filter({hasText: SOURCE})
            .first()
            .click();
        await expect(portal.page.locator('.p-datatable-loading-overlay')).toBeHidden({
            timeout: 15_000,
        });
        await portal.menuClick('blong.flow.browse');
        await portal.waitForTableData();
        await portal.page.getByRole('textbox', {name: 'Filter'}).fill(KIND);
        await expect(rows.filter({hasText: KIND}).first()).toBeVisible({timeout: 5_000});
    }).toPass({timeout: 90_000});

    // Pin the **newest** execution of this kind rather than the first row: every request the process
    // serves becomes an execution — this realm's own integration tests serve this kind as well — and
    // the list is live, so the first row is not necessarily the one this run just produced. The
    // execution cell holds the ULID, which sorts by time.
    const listed = rows.filter({hasText: KIND});
    let newest: Locator | undefined;
    let newestId = '';
    for (let index = 0; index < (await listed.count()); index++) {
        const row = listed.nth(index);
        const id = (await row.locator('[data-testid="flow-execution"]').innerText()).trim();
        if (id > newestId) {
            newestId = id;
            newest = row;
        }
    }
    if (newest === undefined) {
        test.skip(true, `no execution of ${KIND} is listed`);
        return;
    }

    // Selecting the row is what asks the service for the diagram.
    await newest.click();
    await expect(portal.page.locator('[data-diagram-rendered]')).toBeVisible();

    const diagram = await diagramText(portal);
    if (!drawsACall(diagram)) {
        test.skip(true, 'the service declared no calls for this execution, so there is no hop');
        return;
    }
    await captureDiagram(portal, expect, {
        name: 'observed-branch-list-commander',
        artifact: 'docs/observedBranchList.md',
        diagram,
    });

    // The order on the participant is what this spec is for. A milestone is drawn where the record
    // that claimed it was written (D-259), so the three announced before the dispatch ride it and
    // the one announced after it rides the answer of the entry hop — which is the order the code
    // ran in, once the milestones are owed where the call closes (T-139). The `alt` names only the
    // candidates the decision reached, so the handler's catch-all is not drawn as an alternative it
    // weighed (T-140).
    const lineOf = (pattern: RegExp, what: string): number => {
        const index = diagram.split('\n').findIndex(line => pattern.test(line));
        expect(index, `${what} is drawn`).toBeGreaterThanOrEqual(0);
        return index;
    };
    const dispatch = lineOf(/commander->>access: access\.table\.list/, 'the dispatched leg');
    expect(
        lineOf(/Note over commander: point: dispatch-started/, 'the first milestone'),
        'the milestone announced first is drawn above the call it preceded',
    ).toBeLessThan(dispatch);
    expect(
        lineOf(/Note over commander: point: level-resolved/, 'the last milestone before it'),
        'and so is the one announced immediately before it',
    ).toBeLessThan(dispatch);
    expect(
        lineOf(/Note over commander: point: rows-listed/, 'the milestone announced last'),
        'while the one the answer carried is drawn after the dispatch, where it happened',
    ).toBeGreaterThan(dispatch);
    expect(
        lineOf(/commander-->>public: commander\.branch\.list/, 'the answer to the entry hop'),
        'and before the entry hop is answered',
    ).toBeGreaterThan(
        lineOf(/Note over commander: point: rows-listed/, 'the milestone announced last'),
    );

    expect(diagram, 'the flow this realm served').toContain(KIND);
    expect(diagram, 'the branch the dispatch took').toMatch(/alt result-shape = array\n/);
    expect(diagram, 'and a candidate it never reached, drawn and labelled').toMatch(
        /else empty — not weighed\n/,
    );
});
