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

test.use({blongPermissions: true});

const NO_ROWS = 'No available options';

/**
 * Commander rows come straight from live backends whose VALUES can vary per
 * environment (uids, resource versions, keycloak/vault uuids, sizes, kafka
 * offsets, random pod suffixes) and whose ROW SETS can be joined by other
 * suites' `blong-test:*` data. To keep the screenshot baselines deterministic
 * in CI AND locally, we (a) filter the commander table to a stable, seeded
 * subset via its built-in Filter… input, and (b) mask ONLY the specific
 * columns/cells whose values are inherently dynamic (magenta) — never the whole
 * table — so the screenshots still show the UI working (rows render, structure
 * and stable columns are visible).
 */
const MASK_COLOR = '#FF00FF'; // magenta (Playwright's default mask colour)

/** Screenshot options that mask the given 1-based body columns of the table. */
function colsMask(page: Page, ...indexes: number[]) {
    return {
        mask: indexes.map(i => page.locator(`.p-datatable-tbody td:nth-child(${i})`)),
        maskColor: MASK_COLOR,
    };
}

/** Mask the pretty-printed JSON body of the document viewer (values dynamic). */
function viewerJsonMask(page: Page) {
    return {mask: [page.locator('.blong-viewer-document pre')], maskColor: MASK_COLOR};
}

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
    // `kube-system` always exists. Mask the namespace resourceVersion + uid
    // columns (values differ per cluster); keep Name + Status.Phase visible.
    await selectSource(portal.page, 'Kubernetes', 'kube-system');
    await expect(portal.page).toHaveScreenshot(
        'explore-k8s-namespaces.png',
        colsMask(portal.page, 2, 3),
    );
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
    // Pods → the actual pods in the namespace (names/versions/uids are random
    // per cluster → mask those columns; Namespace/DnsPolicy stay visible).
    await openRowByText(portal.page, 'Pods');
    await expect(dataRows(portal.page).first()).toBeVisible({timeout: 15_000});
    await expect(portal.page).toHaveScreenshot(
        'explore-k8s-pods.png',
        colsMask(portal.page, 1, 2, 4, 5, 8),
    );
    // Drill into a pod → document viewer with the pod's fields (JSON values are
    // environment-specific → mask the pretty-printed body, keep field count).
    const firstPod = await dataRows(portal.page).first().locator('td').first().textContent();
    if (firstPod) {
        await openRowByText(portal.page, firstPod.trim());
        await expect(portal.page.locator('.blong-viewer-document')).toBeVisible({
            timeout: 15_000,
        });
        await expect(portal.page).toHaveScreenshot(
            'explore-k8s-pod.png',
            viewerJsonMask(portal.page),
        );
    }
});

test('vault-dev — mounts, secrets, and masked secret viewer', async ({portal}) => {
    await openCommander(portal);
    // `secret/` is a mounted KV secret engine that always exists (mask the
    // per-instance mount accessor column; keep the mount path + description).
    await selectSource(portal.page, 'Vault', 'secret/');
    await expect(portal.page).toHaveScreenshot(
        'explore-vault-mounts.png',
        colsMask(portal.page, 2),
    );
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
    // `blong-integration` db never shifts the rows) and mask the dynamic
    // `Size On Disk` column — Name + Empty stay visible.
    await selectSource(portal.page, 'MongoDB', 'admin');
    await filterRows(portal.page, 'admin');
    await expect(portal.page).toHaveScreenshot(
        'explore-mongo-databases.png',
        colsMask(portal.page, 2),
    );
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
        await expect(portal.page).toHaveScreenshot('explore-redis-keys.png');
    }
});

test('kafka-dev — topics and message viewer', async ({portal}) => {
    await openCommander(portal);
    // `blong-integration` is the only non-internal topic in the dev broker.
    await selectSource(portal.page, 'Kafka', 'blong-integration');
    await expect(portal.page).toHaveScreenshot('explore-kafka-topics.png');
    const topic = await openFirstRowWithChildren(portal.page, 'Kafka (dev)');
    if (topic) {
        // At least one message row must be present.
        await expect(dataRows(portal.page).first()).toBeVisible({timeout: 15_000});
        // Filter to the seeded message (unique content) and mask the dynamic
        // `offset` (Name) column — topic/partition/value stay visible.
        await filterRows(portal.page, 'hello from blong-integration');
        await expect(portal.page).toHaveScreenshot(
            'explore-kafka-messages.png',
            colsMask(portal.page, 1),
        );
    }
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
    // Filter realms to the built-in `master` (deterministic drill target) and
    // mask the per-instance realm Id (uuid) column.
    await selectSource(portal.page, 'Keycloak', 'master');
    await filterRows(portal.page, 'master');
    await expect(portal.page).toHaveScreenshot(
        'explore-keycloak-realms.png',
        colsMask(portal.page, 2),
    );
    await clearFilter(portal.page);
    const realm = await openFirstRowWithChildren(portal.page, 'Keycloak (dev)');
    if (realm) {
        await expect(dataRows(portal.page).first()).toBeVisible({timeout: 15_000});
        // Users: mask the uuid Id + created-timestamp columns (name/state stay).
        await expect(portal.page).toHaveScreenshot(
            'explore-keycloak-users.png',
            colsMask(portal.page, 2, 3),
        );
    }
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
