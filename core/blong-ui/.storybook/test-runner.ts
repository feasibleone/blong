/**
 * Storybook test-runner configuration.
 *
 * Configures visual regression snapshots using jest-image-snapshot.
 * Runs after every story render and captures a screenshot for comparison.
 */

import {fileURLToPath} from 'node:url';
import {join, dirname} from 'node:path';
import type {TestRunnerConfig} from '@storybook/test-runner';
import {toMatchImageSnapshot} from 'jest-image-snapshot';

// ESM: derive __dirname from import.meta.url
const __filename = fileURLToPath(import.meta.url);
const __dir = dirname(__filename);

const config: TestRunnerConfig = {
    setup() {
        expect.extend({toMatchImageSnapshot});
    },
    async postRender(page, context) {
        // Wait for any animations to settle
        await page.waitForTimeout(200);

        const image = await page.screenshot();

        // @ts-expect-error — jest-image-snapshot extends expect at runtime
        expect(image).toMatchImageSnapshot({
            customSnapshotsDir: join(__dir, '../stories/__snapshots__'),
            customSnapshotIdentifier: `${context.id.replace(/[^a-z0-9]/gi, '-')}`,
            failureThreshold: 0.02,
            failureThresholdType: 'percent',
        });
    },
};

export default config;
