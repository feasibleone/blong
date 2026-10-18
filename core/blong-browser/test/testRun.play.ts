/**
 * Capture a real in-page test run.
 *
 * The `Page` story drives the executor through the console and, with `capture`, writes the final
 * model and the event stream into hidden nodes. This spec starts a run, waits for its verdict,
 * asserts what the page shows and attaches the screenshot, model and events to the Playwright
 * report. It is a smoke test of the whole console, not a screenshot baseline.
 *
 *     node --run playwright -- test/testRun.play.ts
 */
import {expect, test, type Page} from '@playwright/test';

interface ICapturedModel {
    status?: string;
    counts?: {total?: number; completed?: number; failed?: number};
    assertions?: {total?: number; threw?: number};
    steps?: Record<string, {status?: string; assertionLog?: Array<{message?: string}>}>;
}

async function readJson<T>(page: Page, testId: string, fallback: T): Promise<T> {
    const text = await page.getByTestId(testId).textContent();
    return text ? (JSON.parse(text) as T) : fallback;
}

test('a live run can be captured with its model and events', async ({page}, testInfo) => {
    await page.goto('/iframe.html?id=components-testrun--page&viewMode=story');
    await expect(page.locator('.blong-test-run-page')).toBeVisible();

    await page.getByRole('button', {name: /^Run$/}).click();
    await expect(page.locator('.blong-test-run__state')).toContainText('completed', {
        timeout: 30_000,
    });
    // The details panel is open on the run log by default; four assertions means four rows.
    await expect(page.locator('.blong-test-run__log')).toHaveCount(4);

    const model = await readJson<ICapturedModel>(page, 'test-run-model', {});
    const events = await readJson<Array<{kind: string}>>(page, 'test-run-events', []);

    expect(model.status).toBe('completed');
    expect(model.counts).toMatchObject({total: 4, completed: 4, failed: 0});
    expect(model.assertions).toEqual({total: 4, threw: 0});
    expect(model.steps?.prepare?.assertionLog?.[0]?.message).toBe('the workspace is ready');
    expect(events.map(event => event.kind)).toEqual(
        expect.arrayContaining(['run:start', 'step:start', 'step:end', 'run:end']),
    );

    const screenshot = await page.locator('.blong-test-run-page').screenshot();
    await testInfo.attach('test-run.png', {body: screenshot, contentType: 'image/png'});
    await testInfo.attach('test-run.json', {
        body: JSON.stringify(model, null, 2),
        contentType: 'application/json',
    });
    await testInfo.attach('test-run-events.json', {
        body: JSON.stringify(events, null, 2),
        contentType: 'application/json',
    });
});
