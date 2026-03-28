/**
 * Generate allurerc.yaml configuration file
 */

import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';

/**
 * Options for allurerc.yaml generation
 */
export interface IAllurercOptions {
    outputDir?: string;
    historyPath?: string;
    historyLimit?: number;
    reportName?: string;
}

/**
 * Generate allurerc.yaml configuration file
 * 
 * This file configures Allure's history tracking and report settings.
 * 
 * @param options - Configuration options
 */
export async function allurercWrite(options: IAllurercOptions = {}): Promise<void> {
    const outputDir = options.outputDir || 'allure-results';
    const historyPath = options.historyPath || '.allure/history.jsonl';
    const historyLimit = options.historyLimit || 30;
    const reportName = options.reportName || 'Blong Test Report';

    const yaml = [
        `# Allure configuration`,
        ``,
        `# History tracking configuration`,
        `historyPath: ${historyPath}`,
        `historyLimit: ${historyLimit}`,
        ``,
        `# Report metadata`,
        `reportName: ${reportName}`,
        ``,
    ].join('\n');

    const filepath = join(outputDir, 'allurerc.yaml');
    await writeFile(filepath, yaml, 'utf-8');
}
