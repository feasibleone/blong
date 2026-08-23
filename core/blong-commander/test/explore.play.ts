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
        page.locator('.p-datatable-tbody tr').filter({hasNotText: NO_ROWS}).filter({
            hasNot: page.locator('.blong-commander-up-link'),
        }).first(),
    ).toBeVisible({timeout: 15_000});
    // The expected element from the real backend must be present.
    await expect(
        page.locator('.p-datatable-tbody tr').filter({hasText: expectedText}).first(),
    ).toBeVisible({timeout: 15_000});
    // The ".." up-to-parent row is the first table row once a location is selected.
    await expect(
        page.locator('.p-datatable-tbody tr').filter({hasText: '..'}).first(),
    ).toBeVisible({timeout: 15_000});
}

/** Data rows = table rows excluding the ".." up-to-parent row. */
const dataRows = (page: Page) =>
    page.locator('.p-datatable-tbody tr').filter({hasNot: page.locator('.blong-commander-up-link')});

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
    // `kube-system` is a namespace that always exists in the cluster.
    await selectSource(portal.page, 'Kubernetes', 'kube-system');
    await expect(portal.page).toHaveScreenshot('explore-k8s-namespaces.png');
    // Drill into the namespace → the resource categories.
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
    // Pods → the actual pods in the namespace.
    await openRowByText(portal.page, 'Pods');
    await expect(dataRows(portal.page).first()).toBeVisible({timeout: 15_000});
    await expect(portal.page).toHaveScreenshot('explore-k8s-pods.png');
    // Drill into a pod → document viewer with the pod's fields.
    const firstPod = await dataRows(portal.page).first().locator('td').first().textContent();
    if (firstPod) {
        await openRowByText(portal.page, firstPod.trim());
        await expect(portal.page.locator('.blong-viewer-document')).toBeVisible({
            timeout: 15_000,
        });
        await expect(portal.page).toHaveScreenshot('explore-k8s-pod.png');
    }
});

test('vault-dev — mounts, secrets, and masked secret viewer', async ({portal}) => {
    await openCommander(portal);
    // `secret/` is a mounted KV secret engine that always exists.
    await selectSource(portal.page, 'Vault', 'secret/');
    await expect(portal.page).toHaveScreenshot('explore-vault-mounts.png');
    // Drill into the mount → the leaf secrets (`data/` sub-path markers are filtered).
    await openRowByText(portal.page, 'secret/');
    await expect(
        portal.page.locator('.p-datatable-tbody tr').filter({hasText: 'commander-demo'}).first(),
    ).toBeVisible({timeout: 15_000});
    await expect(portal.page).toHaveScreenshot('explore-vault-secrets.png');
    // Open the first secret → masked secret viewer (no error).
    await openRowByText(portal.page, 'commander-demo');
    await expect(portal.page.locator('.blong-viewer-secret')).toBeVisible({timeout: 15_000});
    await expect(portal.page).toHaveScreenshot('explore-vault-secret.png');
});

test('mongo-dev — databases and collections', async ({portal}) => {
    await openCommander(portal);
    // `admin` is a database that always exists in MongoDB.
    await selectSource(portal.page, 'MongoDB', 'admin');
    await expect(portal.page).toHaveScreenshot('explore-mongo-databases.png');
    const db = await openFirstRowWithChildren(portal.page, 'MongoDB (dev)');
    if (db) {
        await expect(dataRows(portal.page).first()).toBeVisible({timeout: 15_000});
        await expect(portal.page).toHaveScreenshot('explore-mongo-collections.png');
    }
});

test('redis-dev — database index and keys', async ({portal}) => {
    await openCommander(portal);
    // The databases table shows index `0`.
    await selectSource(portal.page, 'Redis', '0');
    await expect(portal.page).toHaveScreenshot('explore-redis-databases.png');
    // Drill into db 0 → the seeded `commander:demo` key must be present.
    const db = await openFirstRowWithChildren(portal.page, 'Redis (dev)');
    if (db) {
        await expect(
            portal.page.locator('.p-datatable-tbody tr').filter({hasText: 'commander:demo'}).first(),
        ).toBeVisible({timeout: 15_000});
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
        await expect(portal.page).toHaveScreenshot('explore-kafka-messages.png');
    }
});

test('s3-dev — buckets and objects', async ({portal}) => {
    await openCommander(portal);
    // `blong-integration` is the seeded bucket.
    await selectSource(portal.page, 'S3', 'blong-integration');
    await expect(portal.page).toHaveScreenshot('explore-s3-buckets.png');
    const bucket = await openFirstRowWithChildren(portal.page, 'S3 (dev)');
    if (bucket) {
        // The seeded object must be listed.
        await expect(
            portal.page.locator('.p-datatable-tbody tr').filter({hasText: 'commander/hello.txt'}).first(),
        ).toBeVisible({timeout: 15_000});
        await expect(portal.page).toHaveScreenshot('explore-s3-objects.png');
    }
});

test('keycloak-dev — realms and users', async ({portal}) => {
    await openCommander(portal);
    // `master` is the built-in Keycloak realm.
    await selectSource(portal.page, 'Keycloak', 'master');
    await expect(portal.page).toHaveScreenshot('explore-keycloak-realms.png');
    const realm = await openFirstRowWithChildren(portal.page, 'Keycloak (dev)');
    if (realm) {
        await expect(dataRows(portal.page).first()).toBeVisible({timeout: 15_000});
        await expect(portal.page).toHaveScreenshot('explore-keycloak-users.png');
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
        if (await portal.page.locator('.blong-commander-home').isVisible().catch(() => false)) {
            break;
        }
        const up = portal.page.locator('.blong-commander-up-link').first();
        if (!(await up.isVisible().catch(() => false))) break;
        await up.click();
        await portal.page.waitForTimeout(300);
    }
    await expect(portal.page.locator('.blong-commander-home')).toBeVisible({timeout: 15_000});
});
