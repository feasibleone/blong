/**
 * Visual baselines for the TestRun console.
 *
 * These use the frozen fixture stories (`Completed`, `Failure`, `Dense`, `Details`) and the initial
 * `Page` picker; none of them runs the live replay, so no clock or now marker is in the picture.
 * `Details` also asserts that a captured source pointer becomes a link. Any element that can still
 * move is masked rather than tolerated.
 *
 *     node --run playwright -- test/testRun.visual.play.ts
 */
import {expect, test} from '@playwright/test';

const story = (id: string): string => `/iframe.html?id=${id}&viewMode=story`;

test.describe('TestRun visual baselines', () => {
    test.use({viewport: {width: 1440, height: 900}});

    test('the picker starts empty', async ({page}) => {
        await page.goto(story('components-testrun--page'));
        await expect(page.locator('.blong-test-run-page')).toBeVisible();
        await expect(page.locator('.blong-test-run-page')).toHaveScreenshot('test-run-page.png', {
            animations: 'disabled',
            caret: 'hide',
            mask: [page.locator('.blong-test-run__now')],
        });
    });

    test('a completed run is stable', async ({page}) => {
        await page.goto(story('components-testrun--completed'));
        await expect(page.locator('.blong-test-run')).toBeVisible();
        await expect(page.locator('.blong-test-run')).toHaveScreenshot(
            'test-run-completed.png',
            {
                animations: 'disabled',
                caret: 'hide',
                mask: [page.locator('.blong-test-run__now')],
            },
        );
    });

    test('a failed run keeps its error state', async ({page}) => {
        await page.goto(story('components-testrun--failure'));
        await expect(page.locator('.blong-test-run')).toBeVisible();
        await expect(page.locator('.blong-test-run')).toHaveScreenshot('test-run-failure.png', {
            animations: 'disabled',
            caret: 'hide',
            mask: [page.locator('.blong-test-run__now')],
        });
    });

    test('the dense run keeps its layout', async ({page}) => {
        await page.goto(story('components-testrun--dense'));
        await expect(page.locator('.blong-test-run')).toBeVisible();
        await expect(page.locator('.blong-test-run')).toHaveScreenshot('test-run-dense.png', {
            animations: 'disabled',
            caret: 'hide',
            mask: [page.locator('.blong-test-run__now')],
        });
    });

    test('the details panel links its source', async ({page}) => {
        await page.goto(story('components-testrun--details'));
        const console = page.locator('.blong-test-run');
        await expect(console.locator('.blong-test-run__details')).toBeVisible();
        await expect(console.locator('.p-splitter')).toHaveCount(2);
        await expect(console.locator('.blong-test-run__source').first()).toHaveAttribute(
            'href',
            /github\.com\/feasibleone\/blong\/blob\/main/,
        );
        await expect(console).toHaveScreenshot('test-run-details.png', {
            animations: 'disabled',
            caret: 'hide',
            mask: [page.locator('.blong-test-run__now')],
        });
    });
});
