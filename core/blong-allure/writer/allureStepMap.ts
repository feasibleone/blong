/**
 * Map blong-chain IStepProgress to Allure steps
 */

import type {IStepProgress} from '@feasibleone/blong-chain';
import type {IAllureStep} from '../types.js';
import {allureStatusMap} from './allureStatusMap.js';

/**
 * Map IStepProgress array to Allure steps array
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
            name: step.displayName ?? step.stepName,
            status: allureStatusMap(step.status),
            start: step.startTime,
            stop: step.endTime,
        };

        // Add status details if there's an error
        if (step.error) {
            allureStep.statusDetails = {
                message: step.error.message,
                trace: step.error.stack,
            };
        }

        return allureStep;
    });
}
