/**
 * Storybook test-runner configuration for visual regression tests.
 *
 * Uses Playwright page.screenshot() + jest-image-snapshot to save actual PNG
 * baseline images that can be visually reviewed.
 *
 * Run with Storybook serving on port 6006:
 *   npm run storybook:test
 *
 * Or for CI (self-contained build+serve+test):
 *   npm run storybook:test:ci
 *
 * Update baselines: npm run visual:update
 *
 * Baseline PNGs are stored in:
 *   src/client/__image_snapshots__/
 */

const path = require('path');

/** @type {import('@storybook/test-runner').TestRunnerConfig} */
module.exports = {
    async postVisit(page, context) {
        // Lazily extend expect inside the Jest test context
        const {toMatchImageSnapshot} = require('jest-image-snapshot');
        expect.extend({toMatchImageSnapshot});

        // Wait for network idle and rendering to settle
        await page.waitForLoadState('networkidle');

        // Extra delay so SVAR grid finishes rendering and CSS transitions settle
        await page.waitForTimeout(500);

        // Full-page screenshot comparison — saves real PNG files
        const screenshot = await page.screenshot({fullPage: true});
        expect(screenshot).toMatchImageSnapshot({
            customSnapshotsDir: path.join(__dirname, '..', 'src', 'client', '__image_snapshots__'),
            customSnapshotIdentifier: context.id,
            failureThreshold: 0.01,
            failureThresholdType: 'percent',
        });
    },
};
