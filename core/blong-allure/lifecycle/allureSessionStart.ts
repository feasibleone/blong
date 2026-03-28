/**
 * Initialize Allure reporting session
 */

import {mkdir, writeFile, rm, copyFile} from 'node:fs/promises';
import {join} from 'node:path';
import type {IAllureConfig} from '../types.js';

/**
 * Start an Allure reporting session
 * 
 * This initializes the results directory and writes metadata files:
 * - environment.properties (environment info)
 * - executor.json (CI build info)
 * - categories.json (failure classification) - if provided in config
 * 
 * @param config - Allure configuration
 */
export async function allureSessionStart(config: IAllureConfig): Promise<void> {
    const outputDir = config.outputDir || 'allure-results';

    // Create/clear results directory
    try {
        await rm(outputDir, {recursive: true, force: true});
    } catch {
        // Ignore if doesn't exist
    }
    await mkdir(outputDir, {recursive: true});

    // Write environment.properties
    await writeEnvironmentProperties(outputDir);

    // Write executor.json (CI metadata)
    await writeExecutorInfo(outputDir);

    // Copy categories.json if provided
    if (config.categoriesPath) {
        try {
            await copyFile(config.categoriesPath, join(outputDir, 'categories.json'));
        } catch (error: any) {
            console.warn(`Warning: Could not copy categories.json from ${config.categoriesPath}: ${error.message}`);
        }
    }
}

/**
 * Write environment.properties file
 */
async function writeEnvironmentProperties(outputDir: string): Promise<void> {
    const properties: string[] = [
        `framework=blong`,
        `language=typescript`,
        `node.version=${process.version}`,
        `platform=${process.platform}`,
        `arch=${process.arch}`,
    ];

    // Add CI-specific environment variables
    if (process.env.CI) {
        properties.push(`ci=true`);
    }
    if (process.env.GITHUB_RUN_ID) {
        properties.push(`github.run_id=${process.env.GITHUB_RUN_ID}`);
    }

    const filepath = join(outputDir, 'environment.properties');
    await writeFile(filepath, properties.join('\n'), 'utf-8');
}

/**
 * Write executor.json file (CI build metadata)
 */
async function writeExecutorInfo(outputDir: string): Promise<void> {
    const executor: any = {
        type: 'github',
        name: 'Blong Test Suite',
        buildName: process.env.GITHUB_RUN_ID || 'local',
    };

    // Add GitHub-specific info if available
    if (process.env.GITHUB_SERVER_URL && process.env.GITHUB_REPOSITORY && process.env.GITHUB_RUN_ID) {
        executor.url = `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`;
        executor.buildUrl = executor.url;
    }

    // Add build order for history tracking
    if (process.env.GITHUB_RUN_NUMBER) {
        executor.buildOrder = parseInt(process.env.GITHUB_RUN_NUMBER, 10);
    }

    const filepath = join(outputDir, 'executor.json');
    await writeFile(filepath, JSON.stringify(executor, null, 2), 'utf-8');
}
