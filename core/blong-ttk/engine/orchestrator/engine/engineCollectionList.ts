/**
 * List available test collections
 */

import {handler} from '@feasibleone/blong';
import {readdir, stat} from 'node:fs/promises';
import {join} from 'node:path';
import type {IMeta} from '@feasibleone/blong';
import type {ICollectionMetadata} from '../../../types.js';

export default handler(() => ({
    /**
     * List available test collections in a directory
     * 
     * @param params - Search parameters
     * @param $meta - Metadata
     * @returns List of collection metadata
     */
    engineCollectionList: async (
        params: {directory?: string; pattern?: string},
        _$meta: IMeta,
    ): Promise<ICollectionMetadata[]> => {
        const directory = params.directory || './collections';
        const _pattern = params.pattern || '**/*.ts';

        const collections: ICollectionMetadata[] = [];

        try {
            await scanDirectory(directory, collections);
        } catch (error: unknown) {
            throw new Error(`Failed to scan directory ${directory}: ${(error as {message: string}).message}`);
        }

        return collections;
    },
}));

/**
 * Recursively scan directory for collection files
 */
async function scanDirectory(
    dirPath: string,
    collections: ICollectionMetadata[],
): Promise<void> {
    try {
        const entries = await readdir(dirPath);

        for (const entry of entries) {
            const fullPath = join(dirPath, entry);
            const stats = await stat(fullPath);

            if (stats.isDirectory()) {
                // Recurse into subdirectories
                await scanDirectory(fullPath, collections);
            } else if (entry.endsWith('.ts') && !entry.endsWith('.test.ts')) {
                // Found a potential collection file
                collections.push({
                    name: entry.replace('.ts', ''),
                    path: fullPath,
                });
            }
        }
    } catch (_error) {
        // Ignore errors (directory not found, permission denied, etc.)
    }
}
