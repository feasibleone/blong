/**
 * Write one Allure result file for a whole test group.
 *
 * A group is what a reader calls a scenario and what a report is read against
 * ("order checkpoint"), so it is the test case: one result, whose steps are
 * everything the scenario did — the steps it ran, and inside them the points and
 * branches they announced. The writer streams one file per group as the group
 * finishes, so a run that dies still leaves the groups that completed.
 */

import type {IMeta, IStepProgress} from '@feasibleone/blong-chain';
import {createHash, randomUUID} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import type {AllureStatus, IAllureContext, IAllureResult} from '../types.js';
import {allureLabelsBuild} from './allureLabelsBuild.ts';
import {allureLinksBuild} from './allureLinksBuild.ts';
import {allureStepTreeMap} from './allureStepTreeMap.ts';

/** What a group result is written from. */
export interface IAllureGroup {
    /** Display name of the group — the test case name a reader sees. */
    name: string;
    /** Every step the group's executor recorded. */
    steps: IStepProgress[];
    /** When the group started, when the caller knows better than its steps do. */
    start?: number;
    /** When the group stopped, on the same terms. */
    stop?: number;
}

/** The verdict a group carries: a scenario that failed a step failed. */
function statusOf(steps: IStepProgress[]): AllureStatus {
    return steps.some(step => step.status === 'failed') ? 'failed' : 'passed';
}

/** The first and last moment the group's steps cover. */
function spanOf(steps: IStepProgress[]): {start: number; stop: number} {
    const starts = steps.map(step => step.startTime).filter((time): time is number => time != null);
    const stops = steps.map(step => step.endTime).filter((time): time is number => time != null);
    const start = starts.length > 0 ? Math.min(...starts) : Date.now();
    return {start, stop: stops.length > 0 ? Math.max(...stops) : start};
}

/**
 * Write an Allure result file for a test group
 *
 * @param outputDir - Results output directory (e.g. 'allure-results/')
 * @param group - The group's name, steps and (optionally) its own span
 * @param context - Execution context (realm, collection, group)
 * @param meta - Test metadata with traceId
 */
export async function allureGroupResultWrite(
    outputDir: string,
    group: IAllureGroup,
    context: IAllureContext,
    meta?: IMeta,
): Promise<void> {
    const fullName = [context.realm, context.collection, context.group, group.name]
        .filter(Boolean)
        .join('.');
    const {start, stop} = spanOf(group.steps);

    const result: IAllureResult = {
        uuid: randomUUID(),
        // Deterministic, so Allure can follow this scenario across runs and draw a
        // trend rather than a new test case every time.
        historyId: createHash('md5').update(fullName).digest('hex'),
        fullName,
        name: group.name,
        labels: allureLabelsBuild(context),
        links: allureLinksBuild(meta, context),
        status: statusOf(group.steps),
        start: group.start ?? start,
        stop: group.stop ?? stop,
    };

    const failed = group.steps.find(step => step.status === 'failed');
    if (failed?.error) {
        result.statusDetails = {message: failed.error.message, trace: failed.error.stack};
    }

    const steps = allureStepTreeMap(group.steps);
    if (steps !== undefined) result.steps = steps;

    await writeFile(join(outputDir, `${result.uuid}-result.json`), JSON.stringify(result, null, 2));
}
