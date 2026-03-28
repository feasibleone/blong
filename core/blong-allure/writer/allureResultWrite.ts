/**
 * Write Allure test result files
 */

import {randomUUID, createHash} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import type {IStepProgress, IMeta} from '@feasibleone/blong-chain';
import type {IAllureResult, IAllureContext} from '../types.js';
import {allureStatusMap} from './allureStatusMap.js';
import {allureLabelsBuild} from './allureLabelsBuild.js';
import {allureLinksBuild} from './allureLinksBuild.js';
import {allureStepMap} from './allureStepMap.js';

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
    
    // Build full name from context and step name
    const fullNameParts = [
        context.realm,
        context.collection,
        context.group,
        step.name,
    ].filter(Boolean);
    const fullName = fullNameParts.join('.');

    // Compute historyId as deterministic hash of fullName
    const historyId = createHash('md5').update(fullName).digest('hex');

    // Build result object
    const result: IAllureResult = {
        uuid,
        historyId,
        fullName,
        name: step.name,
        labels: allureLabelsBuild(context),
        links: allureLinksBuild(meta, context),
        status: allureStatusMap(step.status),
        start: step.latency?.startedAt || Date.now(),
        stop: step.latency?.completedAt || Date.now(),
    };

    // Add status details if there's an error
    if (step.error) {
        result.statusDetails = {
            message: step.error.message,
            trace: step.error.stack,
        };
    }

    // Map nested steps
    if (step.steps && step.steps.length > 0) {
        result.steps = allureStepMap(step.steps);
    }

    // Write result file
    const filename = `${uuid}-result.json`;
    const filepath = join(outputDir, filename);
    await writeFile(filepath, JSON.stringify(result, null, 2), 'utf-8');
}
