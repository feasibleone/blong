/**
 * Write Allure test result files
 */

import type {IMeta, IStepProgress} from '@feasibleone/blong-chain';
import {createHash, randomUUID} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import type {IAllureContext, IAllureResult} from '../types.js';
import {allureLabelsBuild} from './allureLabelsBuild.js';
import {allureLinksBuild} from './allureLinksBuild.js';
import {allureStatusMap} from './allureStatusMap.js';

/**
 * Write an Allure result file for a test step
 *
 * @param outputDir - Results output directory (e.g., 'allure-results/')
 * @param step - Step progress from blong-chain
 * @param context - Execution context (realm, collection, group)
 * @param meta - Test metadata with traceId
 */
export async function allureResultWrite(
    outputDir: string,
    step: IStepProgress,
    context: IAllureContext,
    meta?: IMeta,
): Promise<void> {
    const uuid = randomUUID();

    const stepName = step.displayName ?? step.stepName;

    // Build full name from context and step name
    const fullNameParts = [context.realm, context.collection, context.group, stepName].filter(
        Boolean,
    );
    const fullName = fullNameParts.join('.');

    // Compute historyId as deterministic hash of fullName
    const historyId = createHash('md5').update(fullName).digest('hex');

    // Build result object
    const result: IAllureResult = {
        uuid,
        historyId,
        fullName,
        name: stepName,
        labels: allureLabelsBuild(context),
        links: allureLinksBuild(meta, context),
        status: allureStatusMap(step.status),
        start: step.startTime || Date.now(),
        stop: step.endTime || Date.now(),
    };

    // Add status details if there's an error
    if (step.error) {
        result.statusDetails = {
            message: step.error.message,
            trace: step.error.stack,
        };
    }

    // Write result file
    const filename = `${uuid}-result.json`;
    const filepath = join(outputDir, filename);
    await writeFile(filepath, JSON.stringify(result, null, 2), 'utf-8');
}
