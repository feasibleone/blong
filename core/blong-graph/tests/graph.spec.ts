import {test, expect} from '@playwright/test';

test.describe('BlongGraph Visualization', () => {
    test('should render graph with nodes and edges', async ({page}) => {
        await page.goto('/');

        // Wait for the graph to load
        await page.waitForSelector('[data-testid="rf__wrapper"]', {timeout: 10000});

        // Check that React Flow canvas is rendered
        const canvas = page.locator('.react-flow');
        await expect(canvas).toBeVisible();

        // Check that controls are visible
        const controls = page.locator('.react-flow__controls');
        await expect(controls).toBeVisible();

        // Check that minimap is visible
        const minimap = page.locator('.react-flow__minimap');
        await expect(minimap).toBeVisible();

        // Take a snapshot for visual regression
        await expect(page).toHaveScreenshot('graph-initial-state.png', {
            fullPage: true,
            maxDiffPixels: 100,
        });
    });

    test('should display node details on click', async ({page}) => {
        await page.goto('/');

        // Wait for the graph to load
        await page.waitForSelector('[data-testid="rf__wrapper"]', {timeout: 10000});

        // Find and click on a node
        const node = page.locator('.react-flow__node').first();
        if (await node.count() > 0) {
            await node.click();

            // Check that details panel appears
            const detailsPanel = page.locator('text=Node Details');
            await expect(detailsPanel).toBeVisible();

            // Take a snapshot with details panel open
            await expect(page).toHaveScreenshot('graph-with-details.png', {
                fullPage: true,
                maxDiffPixels: 100,
            });
        }
    });

    test('should zoom and pan the graph', async ({page}) => {
        await page.goto('/');

        // Wait for the graph to load
        await page.waitForSelector('[data-testid="rf__wrapper"]', {timeout: 10000});

        // Get initial viewport
        const initialViewport = await page.evaluate(() => {
            const viewport = document.querySelector('.react-flow__viewport');
            return viewport?.getAttribute('transform');
        });

        // Click zoom in button
        const zoomInButton = page.locator('.react-flow__controls-zoomin');
        await zoomInButton.click();

        // Wait for viewport transformation to change (animation complete)
        await page.waitForFunction(
            (initial) => {
                const viewport = document.querySelector('.react-flow__viewport');
                return viewport?.getAttribute('transform') !== initial;
            },
            initialViewport,
            {timeout: 2000}
        );

        // Check that viewport has changed
        const newViewport = await page.evaluate(() => {
            const viewport = document.querySelector('.react-flow__viewport');
            return viewport?.getAttribute('transform');
        });

        expect(newViewport).not.toBe(initialViewport);
    });

    test('should handle empty graph gracefully', async ({page}) => {
        // This test would need a way to mock empty data
        // For now, we'll just check that the component doesn't crash
        await page.goto('/');

        // Wait for either graph or error/loading message to appear
        await Promise.race([
            page.waitForSelector('.react-flow', {timeout: 5000}),
            page.waitForSelector('text=/Error|Loading/', {timeout: 5000}),
        ]).catch(() => {
            // Timeout is acceptable - we're testing that the component doesn't crash
        });

        // Check that either graph or error message is shown
        const hasGraph = await page.locator('.react-flow').count() > 0;
        const hasError = await page.locator('text=/Error|Loading/').count() > 0;

        expect(hasGraph || hasError).toBeTruthy();
    });
});

test.describe('BlongGraph Interactivity', () => {
    test('should show different node types with different styles', async ({page}) => {
        await page.goto('/');
        await page.waitForSelector('[data-testid="rf__wrapper"]', {timeout: 10000});

        // Check for different node types if they exist
        const realmNodes = page.locator('.react-flow__node').filter({hasText: 'realm'});
        const layerNodes = page.locator('.react-flow__node').filter({hasText: 'layer'});
        const handlerNodes = page.locator('.react-flow__node').filter({hasText: 'handler'});

        // Take snapshot showing different node types
        if (await realmNodes.count() > 0 || await layerNodes.count() > 0 || await handlerNodes.count() > 0) {
            await expect(page).toHaveScreenshot('graph-node-types.png', {
                fullPage: true,
                maxDiffPixels: 100,
            });
        }
    });

    test('should close details panel on button click', async ({page}) => {
        await page.goto('/');
        await page.waitForSelector('[data-testid="rf__wrapper"]', {timeout: 10000});

        // Click on a node
        const node = page.locator('.react-flow__node').first();
        if (await node.count() > 0) {
            await node.click();

            // Verify details panel is visible
            const detailsPanel = page.locator('text=Node Details');
            await expect(detailsPanel).toBeVisible();

            // Click close button
            const closeButton = page.locator('button:has-text("Close")');
            await closeButton.click();

            // Verify details panel is hidden
            await expect(detailsPanel).not.toBeVisible();
        }
    });
});
