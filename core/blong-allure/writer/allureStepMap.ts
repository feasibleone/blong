/**
 * Map blong-chain IStepProgress to Allure steps
 */

import type {IStepProgress, IStepLatency, IStepError} from '@feasibleone/blong-chain';
import type {IAllureStep, IAllureStatusDetails} from '../types.js';
import {allureStatusMap} from './allureStatusMap.js';

/**
 * Recursively map IStepProgress.steps to Allure steps array
 * 
 * @param steps - Array of step progress objects from blong-chain
 * @returns Array of Allure steps
 */
export function allureStepMap(steps: IStepProgress[] | undefined): IAllureStep[] | undefined {
    if (!steps || steps.length === 0) {
        return undefined;
    }

    return steps.map(step => {
        const allureStep: IAllureStep = {
            name: step.name,
            status: allureStatusMap(step.status),
            start: step.latency?.startedAt,
            stop: step.latency?.completedAt,
        };

        // Add status details if there's an error
        if (step.error) {
            allureStep.statusDetails = {
                message: step.error.message,
                trace: step.error.stack,
            };
        }

        // Recursively map nested steps
        if (step.steps && step.steps.length > 0) {
            allureStep.steps = allureStepMap(step.steps);
        }

        return allureStep;
    });
}
