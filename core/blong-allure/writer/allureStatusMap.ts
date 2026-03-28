/**
 * Map blong-chain step status to Allure status values
 */

import type {AllureStatus} from '../types.js';

/**
 * Translate blong-chain step status to Allure status
 * 
 * @param status - blong-chain status: 'success' | 'error' | 'waiting' | 'skipped'
 * @returns Allure status
 */
export function allureStatusMap(status: string): AllureStatus {
    switch (status) {
        case 'success':
            return 'passed';
        case 'error':
            return 'failed';
        case 'waiting':
        case 'scheduled':
            return 'skipped';
        case 'skipped':
            return 'skipped';
        default:
            return 'unknown';
    }
}

/**
 * Determine if a step is finished based on status
 */
export function isFinished(status: string): boolean {
    return status === 'success' || status === 'error' || status === 'skipped';
}
