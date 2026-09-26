/**
 * Write Allure test result files
 */

import type {IMeta, IStepProgress} from '@feasibleone/blong-chain';
import {createHash, randomUUID} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import type {IAllureContext, IAllureResult} from '../types.js';
import {allureLabelsBuild} from './allureLabelsBuild.ts';
import {allureLinksBuild} from './allureLinksBuild.ts';
import {allureProgressMap} from './allureProgressMap.ts';
import {allureStatusMap} from './allureStatusMap.ts';

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

    // The progress the step announced, as nested steps (PRD R26/R27): a point is a step, and a
    // branch is the group of the points taken inside it. This is the shape `steps` was put on a
    // result for, and the only thing that fills it — a report that shows a step without the
    // moments it reported is the gap this closes.
    const nested = allureProgressMap(step.progress);
    if (nested !== undefined) {
        result.steps = nested;
    }

    // Write result file
    const filename = `${uuid}-result.json`;
    const filepath = join(outputDir, filename);
    await writeFile(filepath, JSON.stringify(result, null, 2), 'utf-8');
}
