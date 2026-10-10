/**
 * Commander explore screenshots — full-stack Playwright tests that log into
 * the commander portal, open the Commander page, and capture the critical
 * "explore moments" for each adapter source: the source list, a branch
 * drill-down, and leaf viewers.
 *
 * These are deliberately screenshot-first (the framework convention); targeted
 * assertions are used sparingly for critical state.
 */
import {expect, test, type Page, type Portal} from '@feasibleone/blong-browser/playwright';
import {redactPageText} from '@feasibleone/blong-browser/playwright/redact';

test.use({blongPermissions: true});

const NO_ROWS = 'No available options';

/**
 * Commander rows come straight from live backends whose VALUES can vary per
 * environment (uids, resource versions, keycloak/vault uuids, sizes, kafka
 * offsets, random pod suffixes) and whose ROW SETS can be joined by other
 * suites' `blong-test:*` data. To keep the screenshot baselines deterministic
 * in CI AND locally, we (a) filter the commander table to a stable, seeded
 * subset via its built-in Filter… input, and (b) redact the values that are
 * inherently dynamic — never the elements that carry them — so the screenshots
 * still show the UI working: the rows render, the columns keep their headers and
 * their shape, and a random value reads `###` (`redactCells`, `redactCellParts`,
 * `JSON_VALUES`; `core/blong-browser/src/playwright/redact.ts` explains why text
 * is rewritten rather than painted over).
 */

/**
 * Redact the whole value of the given 1-based table columns.
 *
 * The alternative is a `mask`, which paints the cell boxes: that hides the
 * column's *place* in the table along with its value, so a reader cannot tell that the
 * table has an identity column at all. Redacting the text keeps the column, its header
 * and the table's shape, and says `###` where a random value was.
 */
async function redactCells(page: Page, ...indexes: number[]) {
    const within = indexes.map(index => `.p-datatable-tbody td:nth-child(${index})`).join(', ');
    await redactPageText(page, [/^.+$/], {within});
}

/**
 * Redact only the volatile *part* of the given 1-based table columns, keeping the rest.
 *
 * A `Size On Disk` cell and a Kafka offset are random numbers inside a stable frame — a
 * column, a header, whatever the adapter puts around the number — and hiding only the
 * digits keeps that frame while making the cell the same width however large the number
 * grows, which a magenta box would have taken along with the value.
 */
async function redactCellParts(page: Page, indexes: number[], patterns: RegExp[]) {
    const within = indexes.map(index => `.p-datatable-tbody td:nth-child(${index})`).join(', ');
    await redactPageText(page, patterns, {within});
}

/** A random number inside a stable frame: a size, an offset, a counter. */
const VOLATILE_NUMBER = /\d[\d.,]*/g;

/**
 * The volatile fragments of a pretty-printed JSON body: the values, not the keys.
 *
 * A key is a quoted string a `:` follows, so a *value* is a quoted string that is not —
 * including the items of a list and the escaped JSON some annotations carry. Redacting
 * those keeps every field name, the separators and the line breaks, so the shot shows
 * which fields a pod exposes; the bare numbers are left alone, because a port and a
 * grace period do not vary per cluster. Two things this must not do, both of which a
 * looser pattern did on the first attempt: swallow a separator (`"key"###"value"`, by
 * matching the `: ` between them) and cross a line break (which collapsed the whole
 * document onto one line) — hence the `(?!:)` and the `[^"\\\n]` in the body.
 */
const JSON_VALUES = /(?<=")(?!:)(?:[^"\\\n]|\\.)*(?="(?!\s*:))/g;

/**
 * The volatile tail of a generated name: `coredns-5d78c9869d-4tm59` is the ReplicaSet
 * hash and the pod suffix, and the prefix is the workload the row is about. The hyphen
 * stays, so the name still reads as one that was generated.
 */
const GENERATED_NAME_TAIL = /(?<=-)[a-z0-9]{9,10}-[a-z0-9]{5}\b/g;

/** Narrow the commander table to rows containing `text` (deterministic subset). */
async function filterRows(page: Page, text: string) {
    const input = page.locator('input[placeholder="Filter…"]').first();
    await input.waitFor({state: 'visible', timeout: 10_000});
    await input.fill(text);
    await page.waitForTimeout(400);
}

/** Clear the commander table filter (it persists across drill navigation). */
async function clearFilter(page: Page) {
    const input = page.locator('input[placeholder="Filter…"]').first();
    if (await input.isVisible().catch(() => false)) {
        await input.fill('');
        await page.waitForTimeout(300);
    }
}

async function openCommander(portal: Portal) {
    // Expand the Explore group and open the Commander page.
    await portal.menuClick('commander.browse');
    await expect(portal.page.locator('.blong-commander')).toBeVisible({timeout: 15_000});
    // Wait for the source tree to render all configured sources.
    await expect(portal.page.locator('.blong-commander-tree .p-treenode')).toHaveCount(8, {
        timeout: 15_000,
    });
}

/**
 * Select a source node in the left tree and wait for its children in the table.
 * `expectedText` asserts a SPECIFIC row is present — proof the drill returned
 * real data (not just "some row", which the stale source list would satisfy).
 */
async function selectSource(page: Page, label: string, expectedText: string) {
    const node = page
        .locator('.blong-commander-tree .p-treenode-content')
        .filter({hasText: label})
        .first();
    await node.click();
    // The source breadcrumb confirms the selection registered.
    await expect(
        page.locator('.blong-commander-path-bar button').filter({hasText: label}).first(),
    ).toBeVisible({timeout: 15_000});
    // Wait for the drill fetch to finish — the DataTable loading overlay (shown
    // while the source's children load) must clear. This avoids racing the drill
    // and capturing the stale source list in the screenshot.
    await expect(page.locator('.p-datatable-loading-overlay')).toBeHidden({timeout: 15_000});
    // A real data row must be present.
    await expect(
        page
            .locator('.p-datatable-tbody tr')
            .filter({hasNotText: NO_ROWS})
            .filter({
                hasNot: page.locator('.blong-commander-up-link'),
            })
            .first(),
    ).toBeVisible({timeout: 15_000});
    // The expected element from the real backend must be present.
    await expect(
        page.locator('.p-datatable-tbody tr').filter({hasText: expectedText}).first(),
    ).toBeVisible({timeout: 15_000});
    // The ".." up-to-parent row is the first table row once a location is selected.
    await expect(page.locator('.p-datatable-tbody tr').filter({hasText: '..'}).first()).toBeVisible(
        {timeout: 15_000},
    );
}

/**
 * Collapse the node the drill expanded, leaving the selection alone.
 *
 * The navigator expands the path down to the selected node, and an expanded node
 * lists *its children* — which for a backend shared with other suites is live data
 * the shot must not depend on: Redis keys are written by every suite that caches
 * anything, so the navigator showed a few dozen `{app:…}:cfg:…` names that change
 * from run to run. Collapsing the node leaves the path (`Redis (dev) > 0`) as the
 * evidence that the drill happened, and the filtered rows in the table as the
 * evidence of what it returned; the key names themselves are in the table anyway.
 *
 * The toggler is found through the selected node's `p-highlight` content, because
 * a node's label (`0` here) is not unique enough to filter on.
 */
async function collapseSelectedNode(page: Page) {
    await page
        .locator(
            '.blong-commander-tree .p-treenode-content.p-highlight [data-pc-section="toggler"]',
        )
        .first()
        .click();
    await page.waitForTimeout(200);
}

/** Data rows = table rows excluding the ".." up-to-parent row. */
const dataRows = (page: Page) =>
    page
        .locator('.p-datatable-tbody tr')
        .filter({hasNot: page.locator('.blong-commander-up-link')});

/** Double-click a table row containing `text` (drills a branch or opens a leaf viewer). */
async function openRowByText(page: Page, text: string) {
    const row = page.locator('.p-datatable-tbody tr').filter({hasText: text}).first();
    await row.dblclick();
    await page.waitForTimeout(500);
}

/**
 * Drill into the first table row whose children are non-empty. Some backends
 * return empty first rows (e.g. a Kubernetes namespace with no pods), so this
 * walks the rows, drilling each one, and backs up to the source root when a
 * drill yields nothing. Returns the opened row label, or null when no row has
 * children.
 */
async function openFirstRowWithChildren(page: Page, backLabel: string): Promise<string | null> {
    for (let i = 0; i < 50; i++) {
        const nonEmptyRows = dataRows(page).filter({hasNotText: NO_ROWS});
        const label = (await nonEmptyRows.nth(i).locator('td').first().textContent())?.trim();
        if (!label) break;
        await openRowByText(page, label);
        // Wait until the child fetch settles. An empty branch now renders ONLY the
        // ".." row (no "No records found" message), so "no data rows" while not
        // loading is the empty signal.
        await expect
            .poll(
                async () => {
                    const dataRowsCount = await dataRows(page)
                        .filter({hasNotText: NO_ROWS})
                        .count();
                    const emptyShown = await page
                        .locator('.p-datatable-tbody tr')
                        .filter({hasText: NO_ROWS})
                        .count();
                    const loadingVisible = await page
                        .locator('.p-datatable-loading-overlay')
                        .isVisible()
                        .catch(() => false);
                    const upOnly =
                        dataRowsCount === 0 &&
                        (await page.locator('.blong-commander-up-link').count()) > 0;
                    return (dataRowsCount > 0 || emptyShown > 0 || upOnly) && !loadingVisible;
                },
                {timeout: 10_000},
            )
            .toBe(true);
        const childCount = await dataRows(page).filter({hasNotText: NO_ROWS}).count();
        if (childCount > 0) return label;
        // No children — back up to the source root via the breadcrumb (re-clicking
        // the already-selected tree node would not re-fire onSelectionChange) and
        // try the next row once the source children have reloaded.
        await page
            .locator('.blong-commander-path-bar button')
            .filter({hasText: backLabel})
            .first()
            .click();
        await expect(page.locator('.p-datatable-loading-overlay')).toBeHidden({
            timeout: 15_000,
        });
        await page.waitForTimeout(200);
    }
    return null;
}

test('source list — the commander home', async ({portal}) => {
    await openCommander(portal);
    await expect(portal.page).toHaveScreenshot('commander-sources.png');
});

test('access-db — browse tables (SQL via access.table.list)', async ({portal}) => {
    await openCommander(portal);
    // Table names are shown stripped of the `access_` prefix; `user` is a real
    // blong access table.
    await selectSource(portal.page, 'Access DB', 'user');
    await expect(portal.page).toHaveScreenshot('explore-access-db-tables.png');
});

test('k8s-dev — namespace → category → resource drill-down and item viewer', async ({portal}) => {
    await openCommander(portal);
    // `kube-system` always exists. The source shows only the namespaces Kubernetes
    // owns — its namespace level declares the whitelist (D-482) — so this shot needs
    // no filter of its own: a cluster also lists whatever its own work created
    // (`blong-suite`, `blong-system`, …), and that set differs from cluster to
    // cluster. The two values that differ per cluster (resourceVersion, uid) are
    // redacted rather than masked, so the shot still shows the columns they belong to
    // and a reader can see that the table has an identity column; Name, Api Version,
    // Kind and Status.Phase are visible either way.
    await selectSource(portal.page, 'Kubernetes', 'kube-system');
    await redactCells(portal.page, 4, 5);
    await expect(portal.page).toHaveScreenshot('explore-k8s-namespaces.png');
    // Drill into the namespace → the resource categories (static labels).
    await openRowByText(portal.page, 'kube-system');
    await expect(
        portal.page.locator('.p-datatable-tbody tr').filter({hasText: 'Workloads'}).first(),
    ).toBeVisible({timeout: 15_000});
    await expect(portal.page).toHaveScreenshot('explore-k8s-categories.png');
    // Workloads → resource types.
    await openRowByText(portal.page, 'Workloads');
    await expect(
        portal.page.locator('.p-datatable-tbody tr').filter({hasText: 'Pods'}).first(),
    ).toBeVisible({timeout: 15_000});
    // Pods → the actual pods in the namespace. The table is filtered to one workload
    // every cluster runs, so the shot does not depend on how many pods the cluster
    // happens to carry. The pod's name keeps its prefix and redacts only the generated
    // tail, and the identity columns (versions/uids) are redacted cell by cell, so the
    // table keeps its shape; Namespace/DnsPolicy stay visible.
    await openRowByText(portal.page, 'Pods');
    await expect(dataRows(portal.page).first()).toBeVisible({timeout: 15_000});
    await filterRows(portal.page, 'coredns');
    await redactPageText(portal.page, [GENERATED_NAME_TAIL]);
    await redactCells(portal.page, 4, 6, 7);
    await expect(portal.page).toHaveScreenshot('explore-k8s-pods.png');
    // Drill into a pod → document viewer with the pod's fields (JSON values are
    // environment-specific → mask the pretty-printed body, keep field count). The name
    // read here is the redacted one, which is what the row now says.
    const firstPod = await dataRows(portal.page).first().locator('td').first().textContent();
    if (firstPod) {
        await openRowByText(portal.page, firstPod.trim());
        await expect(portal.page.locator('.blong-viewer-document')).toBeVisible({
            timeout: 15_000,
        });
        // The drill renders a breadcrumb that names the pod, so the redaction has to
        // follow it: the tree's labels are the nodes it opened, which were redacted
        // before the tree was drawn.
        await redactPageText(portal.page, [GENERATED_NAME_TAIL]);
        // The JSON body keeps its field names and hides the values: which fields a pod
        // exposes is the interesting part, and every value in it belongs to the cluster.
        await redactPageText(portal.page, [JSON_VALUES], {
            within: '.blong-viewer-document pre',
        });
        await expect(portal.page).toHaveScreenshot('explore-k8s-pod.png');
    }
});

test('vault-dev — mounts, secrets, and masked secret viewer', async ({portal}) => {
    await openCommander(portal);
    // `secret/` is a mounted KV secret engine that always exists. The mount accessor is
    // per-instance: its value is redacted, the mount path and description stay.
    await selectSource(portal.page, 'Vault', 'secret/');
    await redactCells(portal.page, 2);
    await expect(portal.page).toHaveScreenshot('explore-vault-mounts.png');
    // Drill into the mount → filter to the seeded secret so other suites'
    // `blong-test` secrets never affect the screenshot.
    await openRowByText(portal.page, 'secret/');
    await expect(
        portal.page.locator('.p-datatable-tbody tr').filter({hasText: 'commander-demo'}).first(),
    ).toBeVisible({timeout: 15_000});
    await filterRows(portal.page, 'commander-demo');
    await expect(portal.page).toHaveScreenshot('explore-vault-secrets.png');
    await clearFilter(portal.page);
    // Open the seeded secret → masked secret viewer (no error; values are masked
    // by the viewer, keys are the deterministic seed → no screenshot mask).
    await openRowByText(portal.page, 'commander-demo');
    await expect(portal.page.locator('.blong-viewer-secret')).toBeVisible({timeout: 15_000});
    await expect(portal.page).toHaveScreenshot('explore-vault-secret.png');
});

test('mongo-dev — databases and collections', async ({portal}) => {
    await openCommander(portal);
    // `admin` always exists in MongoDB. Filter to it (so a parallel suite's
    // `blong-integration` db never shifts the rows) and redact the size's digits — the
    // adapter renders a byte count, so what a reader keeps is the column and its header;
    // Name + Empty stay visible either way.
    await selectSource(portal.page, 'MongoDB', 'admin');
    await filterRows(portal.page, 'admin');
    await redactCellParts(portal.page, [2], [VOLATILE_NUMBER]);
    await expect(portal.page).toHaveScreenshot('explore-mongo-databases.png');
    await clearFilter(portal.page);
    // Drill the filtered `admin` database → its collections are deterministic
    // (Name | Type | Database) so no mask is needed.
    const db = await openFirstRowWithChildren(portal.page, 'MongoDB (dev)');
    if (db) {
        await expect(dataRows(portal.page).first()).toBeVisible({timeout: 15_000});
        await expect(portal.page).toHaveScreenshot('explore-mongo-collections.png');
    }
});

test('redis-dev — database index and keys', async ({portal}) => {
    await openCommander(portal);
    // The databases table shows the single used index `0` (deterministic).
    await selectSource(portal.page, 'Redis', '0');
    await expect(portal.page).toHaveScreenshot('explore-redis-databases.png');
    // Drill into db 0 → the seeded `commander:demo` key must be present.
    const db = await openFirstRowWithChildren(portal.page, 'Redis (dev)');
    if (db) {
        await expect(
            portal.page
                .locator('.p-datatable-tbody tr')
                .filter({hasText: 'commander:demo'})
                .first(),
        ).toBeVisible({timeout: 15_000});
        // Filter to the seeded commander:* keys so other suites' `blong-test:*`
        // keys never appear — the two seeded keys are deterministic.
        await filterRows(portal.page, 'commander');
        // The filter narrows the table, not the navigator, so collapse the expanded
        // database node: its children are every key in a database other suites write
        // to, and the shot must not carry them.
        await collapseSelectedNode(portal.page);
        await expect(portal.page).toHaveScreenshot('explore-redis-keys.png');
    }
});

test('kafka-dev — topics and message viewer', async ({portal}) => {
    await openCommander(portal);
    // `blong-integration` is the only non-internal topic in the dev broker.
    await selectSource(portal.page, 'Kafka', 'blong-integration');
    await expect(portal.page).toHaveScreenshot('explore-kafka-topics.png');
    // The `message` level is what this drill is for. The topic is *named*, not "the first
    // row that has children", for the reason the keycloak realm is (D-494@root): the walk
    // accepts the table it has not left yet, and the shot that used to stand here was the
    // topic list. Naming it reaches the level, whose rows come from a read that waits for
    // its consumer group to join first (D-497@core/blong-gogo) and from a topic the broker
    // seeds on every start rather than only once (D-498) — either fault alone left the
    // level empty.
    await filterRows(portal.page, 'blong-integration');
    await openRowByText(portal.page, 'blong-integration');
    await clearFilter(portal.page);
    // A message row is the only proof the level was reached: a topic row carries a name
    // and a partition count, never this value.
    await expect(
        portal.page
            .locator('.p-datatable-tbody tr')
            .filter({hasText: 'hello from blong-integration'})
            .first(),
    ).toBeVisible({timeout: 30_000});
    // Filter to the seeded message so another suite's messages never reach the shot, and
    // redact the two values the broker decides — the offset (Name) and the timestamp —
    // rather than the columns that carry them. Topic, partition and value are the
    // deterministic parts: the value is the seed's own JSON.
    await filterRows(portal.page, 'hello from blong-integration');
    await redactCellParts(portal.page, [1, 5], [VOLATILE_NUMBER]);
    await expect(portal.page).toHaveScreenshot('explore-kafka-messages.png');
});

test('s3-dev — buckets and objects', async ({portal}) => {
    await openCommander(portal);
    // `blong-integration` is the seeded bucket (the bucket list shows only its
    // name → deterministic).
    await selectSource(portal.page, 'S3', 'blong-integration');
    await expect(portal.page).toHaveScreenshot('explore-s3-buckets.png');
    const bucket = await openFirstRowWithChildren(portal.page, 'S3 (dev)');
    if (bucket) {
        // The seeded object must be listed.
        await expect(
            portal.page
                .locator('.p-datatable-tbody tr')
                .filter({hasText: 'commander/hello.txt'})
                .first(),
        ).toBeVisible({timeout: 15_000});
        // Filter to the seeded object (fixed content → deterministic ETag/size),
        // hiding other suites' `blong-test` objects.
        await filterRows(portal.page, 'commander/');
        await expect(portal.page).toHaveScreenshot('explore-s3-objects.png');
    }
});

test('keycloak-dev — realms and users', async ({portal}) => {
    await openCommander(portal);
    // Filter realms to the built-in `master` (deterministic drill target); the
    // per-instance realm Id (uuid) is redacted, so the column keeps its place.
    await selectSource(portal.page, 'Keycloak', 'master');
    await filterRows(portal.page, 'master');
    await redactCells(portal.page, 2);
    await expect(portal.page).toHaveScreenshot('explore-keycloak-realms.png');
    await clearFilter(portal.page);
    // The realm is named, not "the first row that has children": the table lists realms
    // alphabetically, `blong-integration` comes before `master`, and the moment that realm
    // holds a user of its own the walk would drill into *it* and the shot would become a
    // picture of another realm's users — which is what the CI diff showed (D-494). Filtering
    // to the realm leaves exactly one row to open, and its children are the seeded
    // `blong-admin`.
    await filterRows(portal.page, 'master');
    await openRowByText(portal.page, 'master');
    // The drill keeps the filter, so clear it before the shot: the baseline shows every user
    // of the realm, not the ones a leftover filter matched.
    await clearFilter(portal.page);
    // The empty state renders as a row, so `dataRows` alone would accept "nothing observed
    // yet" as the children the drill was supposed to return. This is the assertion that the
    // realm really opened, and it fails rather than skipping the shot when it did not.
    await expect(dataRows(portal.page).filter({hasNotText: NO_ROWS}).first()).toBeVisible({
        timeout: 15_000,
    });
    // Users: the uuid Id and the created timestamp are redacted whole — name/state stay
    // visible. The timestamp is not digit-by-digit: its rendered width depends on the
    // digits it hides (`10/10/2026, 3:03:58 PM` narrows at a single-digit hour), so
    // hiding only the digits would make the shot depend on the values it hides.
    await redactCells(portal.page, 2, 3);
    await expect(portal.page).toHaveScreenshot('explore-keycloak-users.png');
});

test('navigator mirrors the drill path; ".." and Backspace go up', async ({portal}) => {
    await openCommander(portal);
    await selectSource(portal.page, 'Kubernetes', 'kube-system');
    const upLink = portal.page.locator('.blong-commander-up-link');
    await expect(upLink).toBeVisible();

    // Drill the namespace → category → resource → pods: the tree reveals the
    // full path (more than the 8 source roots are shown).
    await openRowByText(portal.page, 'kube-system');
    await openRowByText(portal.page, 'Workloads');
    await openRowByText(portal.page, 'Pods');
    await expect(
        portal.page.locator('.blong-commander-tree .p-treenode').count(),
    ).resolves.toBeGreaterThan(8);
    await expect(
        portal.page
            .locator('.blong-commander-tree .p-treenode-content')
            .filter({hasText: 'Pods'})
            .first(),
    ).toBeVisible({timeout: 15_000});

    // Backspace goes up one level → back to the resource types.
    await portal.page.keyboard.press('Backspace');
    await expect(
        portal.page.locator('.p-datatable-tbody tr').filter({hasText: 'Deployments'}).first(),
    ).toBeVisible({timeout: 15_000});

    // ".." navigates up one level at a time; climb back to the home welcome panel.
    for (let i = 0; i < 6; i++) {
        if (
            await portal.page
                .locator('.blong-commander-home')
                .isVisible()
                .catch(() => false)
        ) {
            break;
        }
        const up = portal.page.locator('.blong-commander-up-link').first();
        if (!(await up.isVisible().catch(() => false))) break;
        await up.click();
        await portal.page.waitForTimeout(300);
    }
    await expect(portal.page.locator('.blong-commander-home')).toBeVisible({timeout: 15_000});
});
