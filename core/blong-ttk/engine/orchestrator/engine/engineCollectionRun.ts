/**
 * Run a test collection
 */

import {handler} from '@feasibleone/blong';
import {TestExecutor} from '@feasibleone/blong-chain';
import {allureSessionStart, allureSessionEnd, allureResultWrite} from '@feasibleone/blong-allure';
import type {IMeta} from '@feasibleone/blong';
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
        const collectionModule = typeof config.collection === 'string'
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
            timeout: config.timeout || 60000,
        });

        // Subscribe to step completion events to write Allure results
        executor.on('step:end', async (step) => {
            const context = {
                realm: config.realm || 'ttk',
                collection: typeof config.collection === 'string' 
                    ? config.collection.split('/').pop()?.replace('.ts', '')
                    : 'collection',
                logUrl: allureConfig.logUrl,
            };
            
            await allureResultWrite(
                allureConfig.outputDir,
                step,
                context,
                $meta,
            );
        });

        try {
            // Execute the collection
            const results = await executor.run(collectionHandler);

            // End Allure session
            await allureSessionEnd(allureConfig);

            return {
                success: true,
                totalTests: results.length,
                passed: results.filter(r => r.status === 'success').length,
                failed: results.filter(r => r.status === 'error').length,
                skipped: results.filter(r => r.status === 'skipped').length,
                duration: Date.now() - (results[0]?.latency?.startedAt || Date.now()),
                results,
            };
        } catch (error: any) {
            // End Allure session even on error
            await allureSessionEnd(allureConfig);

            return {
                success: false,
                error: error.message,
                stack: error.stack,
            };
        }
    },
}));
