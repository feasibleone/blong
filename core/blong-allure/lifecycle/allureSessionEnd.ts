/**
 * End Allure reporting session
 */

import {spawn} from 'node:child_process';
import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import type {IAllureConfig, IAllureCategory} from '../types.js';

/**
 * End an Allure reporting session
 * 
 * This flushes any pending results and optionally invokes
 * `allure generate` to create the HTML report.
 * 
 * @param config - Allure configuration
 */
export async function allureSessionEnd(config: IAllureConfig): Promise<void> {
    const outputDir = config.outputDir || 'allure-results';

    // Write categories.json if categories are defined
    if (config.categories && config.categories.length > 0) {
        await writeCategoriesFile(outputDir, config.categories);
    }

    console.log(`Allure results written to: ${outputDir}`);

    // Optionally generate HTML report
    if (config.generateOnEnd) {
        await generateReport(outputDir);
    }
}

/**
 * Write categories.json for failure classification
 */
async function writeCategoriesFile(
    outputDir: string,
    categories: IAllureCategory[],
): Promise<void> {
    const filepath = join(outputDir, 'categories.json');
    await writeFile(filepath, JSON.stringify(categories, null, 2), 'utf-8');
}

/**
 * Invoke `allure generate` CLI to create HTML report
 */
async function generateReport(outputDir: string): Promise<void> {
    return new Promise((resolve, reject) => {
        console.log(`Generating Allure HTML report...`);
        
        const reportDir = 'allure-report';
        const child = spawn('allure', ['generate', outputDir, '-o', reportDir, '--clean'], {
            stdio: 'inherit',
            shell: true,
        });

        child.on('close', code => {
            if (code === 0) {
                console.log(`Allure report generated: ${reportDir}/index.html`);
                resolve();
            } else {
                reject(new Error(`allure generate exited with code ${code}`));
            }
        });

        child.on('error', err => {
            reject(new Error(`Failed to invoke allure CLI: ${err.message}`));
        });
    });
}
