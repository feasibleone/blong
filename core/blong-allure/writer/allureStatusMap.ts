/**
 * Map blong-chain step status to Allure status values
 */

import type {AllureStatus} from '../types.js';

/**
 * Translate blong-chain step status to Allure status
 *
 * @param status - blong-chain status: 'pending' | 'running' | 'completed' | 'failed'
 * @returns Allure status
 */
export function allureStatusMap(status: string): AllureStatus {
    switch (status) {
        case 'completed':
            return 'passed';
        case 'failed':
            return 'failed';
        case 'pending':
        case 'running':
            return 'skipped';
        default:
            return 'unknown';
    }
}

/**
 * Determine if a step is finished based on status
 */
export function isFinished(status: string): boolean {
    return status === 'completed' || status === 'failed';
}
