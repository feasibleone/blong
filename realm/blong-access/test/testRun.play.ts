/**
 * Test runs page — the browser flows, started and captured from the access portal.
 *
 * The page is linked only by the `test-ui` config block of `index.browser.ts`, and the catalog is
 * the guard: the page can only load the methods it lists. This spec opens the page, runs each
 * browser flow, waits for its verdict and attaches the screenshot, final model and event stream to
 * the report.
 *
 *     node --run playwright -- test/testRun.play.ts
 */
import {expect, test} from '@feasibleone/blong-browser/playwright';
import {readFileSync} from 'node:fs';

const SOURCE_HREF = process.env.BLONG_VSCODE_REMOTE
    ? /^vscode:\/\/vscode-remote\//
    : /^(?:vscode:\/\/|https:\/\/github\.com\/.+\/blob\/)/;

/** The authored line and column of the first `login` assertion in the browser fixture. */
const LOGIN_ASSERTION = (() => {
    const lines = readFileSync(
        new URL('../browser/test/test/testSessionFlow.ts', import.meta.url),
        'utf8',
    ).split('\n');
    const line = lines.findIndex(text => text.includes('login returns an access token')) + 1;
    return {line, column: lines[line - 1]!.indexOf('assert.ok') + 'assert.'.length + 1};
})();

test.describe('Access test runs', () => {
    // The authorization flow asks for refusals on purpose — a protected call with no
    // token (401), then the same call as a user without the action (403) — and Chromium
    // logs every non-2xx response as a `Failed to load resource` console error that no
    // application code can suppress.  The declaration names the method, because the note
    // carries the request URL; the flow's own assertions are what prove the refusal.
    test.use({blongExpectedBrowserErrors: ['access/test/private']});

    test('runs the browser session flow from the Test runs page', async ({portal}, testInfo) => {
        const page = portal.page;
        test.setTimeout(180_000);
        await expect(page.locator('.blong-portal-menubar')).toBeVisible();

        // The menu is part of the test-ui portal config, not the default access portal.
        await page.locator('.p-menubar-root-list').getByText('Test', {exact: true}).click();
        await page.getByText('Test runs', {exact: true}).click();

        const testRunPage = page.locator('.blong-test-run-page');
        await expect(testRunPage).toBeVisible();
        await expect(testRunPage.locator('.p-dropdown-label')).toHaveText('session flow browser');

        await testRunPage.getByRole('button', {name: /^Run$/}).click();
        await expect(testRunPage.locator('.blong-test-run__state')).toContainText('completed', {
            timeout: 120_000,
        });
        await expect(testRunPage.locator('.blong-test-run__log').first()).toBeVisible();

        const model = JSON.parse(
            (await testRunPage.getByTestId('test-run-model').textContent()) ?? '{}',
        ) as {
            status?: string;
            counts?: {total?: number; completed?: number; failed?: number};
            assertions?: {total?: number; threw?: number};
            steps?: Record<
                string,
                {
                    status?: string;
                    assertionLog?: Array<{
                        message?: string;
                        source?: {file?: string; line?: number; column?: number};
                    }>;
                }
            >;
        };
        const events = JSON.parse(
            (await testRunPage.getByTestId('test-run-events').textContent()) ?? '[]',
        ) as Array<{kind: string}>;

        expect(model.status).toBe('completed');
        expect(model.counts).toMatchObject({total: 4, completed: 4, failed: 0});
        expect(model.assertions?.threw).toBe(0);
        expect(model.steps?.login?.status).toBe('completed');
        expect(model.steps?.login?.assertionLog?.length).toBeGreaterThan(0);
        // The browser stack points at Vite's transformed module; the pointer the page shows must
        // be the authored assertion (`assert.ok(result.access_token, …)`), not its generated line.
        expect(model.steps?.login?.assertionLog?.[0]?.source).toMatchObject({
            file: expect.stringContaining('testSessionFlow.ts'),
            ...LOGIN_ASSERTION,
        });
        const source = testRunPage.locator('.blong-test-run__source').first();
        await expect(source).toBeVisible();
        expect(await source.getAttribute('href')).toMatch(SOURCE_HREF);
        expect(events.map(event => event.kind)).toEqual(
            expect.arrayContaining(['run:start', 'step:start', 'step:end', 'run:end']),
        );

        await testInfo.attach('access-test-run.png', {
            body: await testRunPage.screenshot(),
            contentType: 'image/png',
        });
        await testInfo.attach('access-test-run.json', {
            body: JSON.stringify(model, null, 2),
            contentType: 'application/json',
        });
        await testInfo.attach('access-test-run-events.json', {
            body: JSON.stringify(events, null, 2),
            contentType: 'application/json',
        });
    });

    test('runs the browser authorization flow from the Test runs page', async ({
        portal,
    }, testInfo) => {
        const page = portal.page;
        test.setTimeout(180_000);
        await expect(page.locator('.blong-portal-menubar')).toBeVisible();

        await page.locator('.p-menubar-root-list').getByText('Test', {exact: true}).click();
        await page.getByText('Test runs', {exact: true}).click();

        const testRunPage = page.locator('.blong-test-run-page');
        await expect(testRunPage).toBeVisible();
        await testRunPage.locator('.blong-test-run-page__picker').click();
        await page.getByRole('option', {name: 'authorization flow browser'}).click();
        await expect(testRunPage.locator('.p-dropdown-label')).toHaveText(
            'authorization flow browser',
        );

        await testRunPage.getByRole('button', {name: /^Run$/}).click();
        await expect(testRunPage.locator('.blong-test-run__state')).toContainText('completed', {
            timeout: 120_000,
        });

        const model = JSON.parse(
            (await testRunPage.getByTestId('test-run-model').textContent()) ?? '{}',
        ) as {
            status?: string;
            counts?: {total?: number; completed?: number; failed?: number};
            steps?: Record<string, {status?: string; assertionLog?: Array<{message?: string}>}>;
        };

        expect(model.status).toBe('completed');
        expect(model.counts).toMatchObject({total: 7, completed: 7, failed: 0});
        expect(model.steps?.httpNoAuth?.status).toBe('completed');
        expect(model.steps?.browserAuthList?.status).toBe('completed');
        expect(model.steps?.httpNoAuth?.assertionLog?.length).toBeGreaterThan(0);

        await testInfo.attach('access-authorization-test-run.png', {
            body: await testRunPage.screenshot(),
            contentType: 'image/png',
        });
        await testInfo.attach('access-authorization-test-run.json', {
            body: JSON.stringify(model, null, 2),
            contentType: 'application/json',
        });
    });

    test('runs the server-hosted login flow from the Test runs page', async ({
        portal,
    }, testInfo) => {
        const page = portal.page;
        test.setTimeout(180_000);
        await expect(page.locator('.blong-portal-menubar')).toBeVisible();

        await page.locator('.p-menubar-root-list').getByText('Test', {exact: true}).click();
        await page.getByText('Test runs', {exact: true}).click();

        const testRunPage = page.locator('.blong-test-run-page');
        await expect(testRunPage).toBeVisible();
        await testRunPage.locator('.blong-test-run-page__picker').click();
        await page.getByRole('option', {name: 'login flow server'}).click();
        await expect(testRunPage.locator('.p-dropdown-label')).toHaveText('login flow server');

        await testRunPage.getByRole('button', {name: /^Run$/}).click();
        await expect(testRunPage.locator('.blong-test-run__state')).toContainText('completed', {
            timeout: 120_000,
        });

        const model = JSON.parse(
            (await testRunPage.getByTestId('test-run-model').textContent()) ?? '{}',
        ) as {
            host?: string;
            status?: string;
            counts?: {failed?: number};
            steps?: Record<string, {status?: string}>;
        };
        expect(model.host).toBe('server');
        expect(model.status).toBe('completed');
        expect(model.counts?.failed).toBe(0);
        expect(model.steps?.login?.status).toBe('completed');
        const source = testRunPage.locator('.blong-test-run__source').first();
        await expect(source).toBeVisible();
        expect(await source.getAttribute('href')).toMatch(SOURCE_HREF);

        await testInfo.attach('access-server-test-run.png', {
            body: await testRunPage.screenshot(),
            contentType: 'image/png',
        });
        await testInfo.attach('access-server-test-run.json', {
            body: JSON.stringify(model, null, 2),
            contentType: 'application/json',
        });
    });
});
