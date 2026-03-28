/**
 * Type definitions for Allure 3 integration
 */

import type {IStepProgress, IStepLatency, IStepError, IMeta} from '@feasibleone/blong-chain';

/**
 * Allure 3 test result status values
 */
export type AllureStatus = 'passed' | 'failed' | 'broken' | 'skipped' | 'unknown';

/**
 * Allure 3 label
 */
export interface IAllureLabel {
    name: string;
    value: string;
}

/**
 * Allure 3 link
 */
export interface IAllureLink {
    type: string;
    name?: string;
    url: string;
}

/**
 * Allure 3 parameter
 */
export interface IAllureParameter {
    name: string;
    value: string;
}

/**
 * Allure 3 attachment
 */
export interface IAllureAttachment {
    name: string;
    type: string;
    source: string;
}

/**
 * Allure 3 status details
 */
export interface IAllureStatusDetails {
    message?: string;
    trace?: string;
    flaky?: boolean;
}

/**
 * Allure 3 step (nested)
 */
export interface IAllureStep {
    name: string;
    status: AllureStatus;
    statusDetails?: IAllureStatusDetails;
    stage?: 'scheduled' | 'running' | 'finished' | 'pending' | 'interrupted';
    start?: number;
    stop?: number;
    steps?: IAllureStep[];
    attachments?: IAllureAttachment[];
    parameters?: IAllureParameter[];
}

/**
 * Allure 3 test result (written to {uuid}-result.json)
 */
export interface IAllureResult {
    uuid: string;
    historyId: string;
    fullName: string;
    name: string;
    labels: IAllureLabel[];
    links?: IAllureLink[];
    status: AllureStatus;
    statusDetails?: IAllureStatusDetails;
    stage?: 'scheduled' | 'running' | 'finished' | 'pending' | 'interrupted';
    start: number;
    stop: number;
    steps?: IAllureStep[];
    attachments?: IAllureAttachment[];
    parameters?: IAllureParameter[];
}

/**
 * Configuration for Allure session
 */
export interface IAllureConfig {
    outputDir?: string;
    historyPath?: string;
    generateOnEnd?: boolean;
    logUrl?: string;
    categories?: IAllureCategory[];
}

/**
 * Allure category for failure classification
 */
export interface IAllureCategory {
    name: string;
    matchedStatuses?: AllureStatus[];
    messageRegex?: string;
    traceRegex?: string;
}

/**
 * Context for result generation
 */
export interface IAllureContext {
    realm?: string;
    collection?: string;
    group?: string;
    logUrl?: string;
}

/**
 * Allure attachment descriptor
 */
export interface IAllureAttachmentDescriptor {
    uuid: string;
    name: string;
    type: string;
    source: string;
}
