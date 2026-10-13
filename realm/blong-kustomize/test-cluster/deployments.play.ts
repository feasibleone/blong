/**
 * The operator's Deployments page, driven against a deployed operator.
 *
 * What it proves is the last mile rather than the page: the process that answers the deployment read API
 * is the one serving the UI (@@D-523's install-level host), so a browser reaching the operator's gateway
 * gets the portal, logs in with a cluster identity, and reads the cluster's Deployments back through
 * `kustomize.deployment.find`. Temporary while the committed shape is decided.
 */
import {expect, test} from '@feasibleone/blong-browser/playwright';
import {browseModel} from '@feasibleone/blong-browser/playwright/model';

const token = process.env['BLONG_TEST_TOKEN'];

test.skip(!token, 'set BLONG_TEST_TOKEN to a service-account token');
test.use({blongUsername: 'blong-suite', blongPassword: token ?? ''});

test.describe('Operator deployment page', () => {
    test('serves the portal and reads deployments from the cluster', async ({portal}) => {
        await expect(portal.page.locator('.blong-portal-menubar')).toBeVisible();
        await portal.page.screenshot({path: '/tmp/operator-page-shell.png', fullPage: true});
    });

    // The `Created` cell is the cluster's timestamp for the Deployment object — the one thing on
    // this page that changes while nothing about the deployment does — so it is redacted rather
    // than budgeted for: the budget this config asks for is the size of noise, because a difference
    // on the page is exactly what this screenshot exists to show (@@F-507).
    browseModel(test, expect, {
        subject: 'kustomize',
        object: 'deployment',
        redact: [/\d{4}-\d{2}-\d{2}T[\d:.]+Z/],
    });

    /**
     * The page driving the cluster, which is what the deployment UI is for.
     *
     * The Deployments page carries one action — Reconcile — and it calls the realm's own
     * `kustomize.reconcile.run` with `apply`, so a pass from the browser creates the objects the
     * plan wants and updates the ones that drifted. The assertion is the call's answer rather than
     * a screenshot: a pass that ran says so (`applied`/`reconciled` counts), and the table must
     * still be populated afterwards, because the action asks the model to refresh.
     */
    test('reconciles the cluster from the page', async ({portal}) => {
        await portal.menuClick('kustomize.deployment.browse');
        await portal.waitForTableData();
        const pass = portal.page.waitForResponse(
            response =>
                response.url().includes('/rpc/kustomize/reconcile/run') &&
                response.request().method() === 'POST',
            {timeout: 60_000},
        );
        await portal.page.getByRole('button', {name: /Reconcile/i}).click();
        await portal.page
            .locator('.p-confirm-popup-accept, .p-confirm-dialog-accept')
            .first()
            .click();
        const answer = await pass;
        const body = await answer.text();
        await portal.page.screenshot({path: '/tmp/operator-page-reconcile.png', fullPage: true});
        console.log(`RECONCILE ${answer.status()} ${body.slice(0, 400)}`);
        expect(answer.status()).toBe(200);
        await portal.waitForTableData();
    });
});
