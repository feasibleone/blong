/**
 * Convert JSON collection to TypeScript
 */

import {handler} from '@feasibleone/blong';
import {writeFile, mkdir} from 'node:fs/promises';
import {dirname} from 'node:path';
import type {IMeta} from '@feasibleone/blong';
import {parseCollection} from '../../../lib/parser.js';
import {emitCollection} from '../../../lib/emitter.js';
import type {IMigrationResult} from '../../../types.js';

export default handler(() => ({
    /**
     * Convert ml-testing-toolkit JSON collection to TypeScript
     * 
     * @param params - Conversion parameters
     * @param $meta - Metadata
     */
    migrateMigrateCollectionConvert: async (
        params: {
            sourcePath: string;
            targetPath: string;
        },
        $meta: IMeta,
    ): Promise<IMigrationResult> => {
        const errors: string[] = [];
        const warnings: string[] = [];

        try {
            // Parse JSON collection
            console.log(`Parsing ${params.sourcePath}...`);
            const collection = await parseCollection(params.sourcePath);

            // Emit TypeScript code
            console.log(`Generating TypeScript code...`);
            const tsCode = emitCollection(collection);

            // Ensure target directory exists
            await mkdir(dirname(params.targetPath), {recursive: true});

            // Write output file
            console.log(`Writing ${params.targetPath}...`);
            await writeFile(params.targetPath, tsCode, 'utf-8');

            console.log(`✓ Migration complete: ${params.targetPath}`);

            // Add warnings for manual review items
            if (collection.test_cases.some(tc => 
                tc.requests.some(r => r.scripts?.preRequest || r.scripts?.postRequest)
            )) {
                warnings.push(
                    'Collection contains JavaScript scripts that may need manual review',
                );
            }

            return {
                sourcePath: params.sourcePath,
                targetPath: params.targetPath,
                success: true,
                errors: errors.length > 0 ? errors : undefined,
                warnings: warnings.length > 0 ? warnings : undefined,
            };
        } catch (error: any) {
            errors.push(error.message);
            
            return {
                sourcePath: params.sourcePath,
                targetPath: params.targetPath,
                success: false,
                errors,
                warnings: warnings.length > 0 ? warnings : undefined,
            };
        }
    },
}));
