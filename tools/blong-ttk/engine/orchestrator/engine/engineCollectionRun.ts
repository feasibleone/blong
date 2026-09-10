/**
 * Run a test collection
 */

import type {IMeta} from '@feasibleone/blong';
import {handler} from '@feasibleone/blong';
import {allureResultWrite, allureSessionEnd, allureSessionStart} from '@feasibleone/blong-allure';
import type {IMeta as IChainMeta} from '@feasibleone/blong-chain';
import {TestExecutor} from '@feasibleone/blong-chain';
import type {ICollectionConfig} from '../../../types.js';

export default handler(() => ({
    /**
     * Run a test collection with blong-chain TestExecutor
     *
     * @param config - Collection configuration
     * @param $meta - Metadata
     * @returns Execution results
     */
    engineCollectionRun: async (config: ICollectionConfig, $meta: IMeta) => {
        // Load collection module
        const collectionModule =
            typeof config.collection === 'string'
                ? await import(config.collection)
                : await config.collection();

        // Extract test handlers from collection
        const collectionHandler = collectionModule.default;
        if (!collectionHandler || typeof collectionHandler !== 'function') {
            throw new Error('Collection must export a default handler');
        }

        // Start Allure session
        const allureConfig = {
            outputDir: 'allure-results',
            historyPath: '.allure/history.jsonl',
            generateOnEnd: false,
            logUrl: config.logUrl || 'http://localhost:9998/trace/{traceId}',
        };
        await allureSessionStart(allureConfig);

        // Create test executor
        const executor = new TestExecutor({
            concurrency: config.concurrency || 10,
        });

        // Subscribe to step completion events to write Allure results
        executor.on('step:end', async (stepName: string, step) => {
            const context = {
                realm: config.realm || 'ttk',
                collection:
                    typeof config.collection === 'string'
                        ? config.collection.split('/').pop()?.replace('.ts', '')
                        : 'collection',
                logUrl: allureConfig.logUrl,
            };

            await allureResultWrite(
                allureConfig.outputDir,
                step,
                context,
                $meta as unknown as IChainMeta,
            );
        });

        try {
            // Execute the collection
            await executor.execute(collectionHandler, $meta as unknown as IChainMeta);

            // End Allure session
            await allureSessionEnd(allureConfig);

            // Get progress snapshot
            const progress = executor.getProgress();
            const steps = Array.from(progress.steps.values());

            return {
                success: progress.status !== 'failed',
                totalTests: steps.length,
                passed: steps.filter(s => s.status === 'completed').length,
                failed: steps.filter(s => s.status === 'failed').length,
                duration: (progress.endTime ?? Date.now()) - progress.startTime,
            };
        } catch (error: unknown) {
            // End Allure session even on error
            await allureSessionEnd(allureConfig);

            return {
                success: false,
                error: (error as {message: string}).message,
                stack: (error as {stack?: string}).stack,
            };
        }
    },
}));
