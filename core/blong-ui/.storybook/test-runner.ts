/**
 * Storybook test-runner configuration.
 *
 * Configures visual regression snapshots using jest-image-snapshot.
 * Runs after every story render and captures a screenshot for comparison.
 */

import type {TestRunnerConfig} from '@storybook/test-runner';
import {toMatchImageSnapshot} from 'jest-image-snapshot';

const config: TestRunnerConfig = {
    setup() {
        expect.extend({toMatchImageSnapshot});
    },
    async postRender(page, context) {
        // Wait for any animations to settle
        await page.waitForTimeout(200);

        const image = await page.screenshot();

        // @ts-expect-error — jest-image-snapshot extends expect
        expect(image).toMatchImageSnapshot({
            customSnapshotsDir: `${__dirname}/../stories/__snapshots__`,
            customSnapshotIdentifier: `${context.id.replace(/[^a-z0-9]/gi, '-')}`,
            failureThreshold: 0.02,
            failureThresholdType: 'percent',
        });
    },
};

export default config;
