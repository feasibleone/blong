/**
 * Extract common helper functions from analyzed collections
 */

import type { IMeta } from '@feasibleone/blong';
import { handler } from '@feasibleone/blong';
import { mkdir, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { operationToHandlerName } from '../../../library/emitter.js';
import { parseCollection } from '../../../library/parser.js';

export default handler(() => ({
    /**
     * Analyze multiple collections and generate a shared helpers file listing
     * the operations that appear across 2+ collections.
     *
     * @param params - Extraction parameters
     * @param $meta - Metadata
     */
    migrateMigrateHelperExtract: async (
        params: {
            /** Paths to the source JSON collection files */
            sourcePaths: string[];
            /** Directory to write helpers.ts into */
            targetDir: string;
            /** Minimum number of collections an operation must appear in (default 2) */
            minCollections?: number;
        },
        _$meta: IMeta,
    ) => {
        const minCollections = params.minCollections ?? 2;

        // Parse all collections
        const parsed: Array<{label: string; path: string; operations: Set<string>}> = [];
        for (const sourcePath of params.sourcePaths) {
            const collection = await parseCollection(sourcePath);
            const operations = new Set<string>();
            for (const tc of collection.test_cases) {
                for (const req of tc.requests) {
                    operations.add(`${req.method.toUpperCase()} ${req.operationPath}`);
                }
            }
            parsed.push({label: basename(sourcePath, '.json'), path: sourcePath, operations});
        }

        // Count how many collections use each operation
        const operationUses = new Map<string, string[]>(); // op → collection labels
        for (const {label, operations} of parsed) {
            for (const op of operations) {
                if (!operationUses.has(op)) operationUses.set(op, []);
                operationUses.get(op)!.push(label);
            }
        }

        // Shared = appears in at least minCollections collections
        const shared = Array.from(operationUses.entries())
            .filter(([, labels]) => labels.length >= minCollections)
            .sort((a, b) => b[1].length - a[1].length);

        // Generate helpers.ts
        const lines: string[] = [];
        lines.push('/**');
        lines.push(' * Shared handler reference extracted from cross-collection analysis.');
        lines.push(' * These operations appear in multiple collections and are good candidates');
        lines.push(' * for a reusable test helper library.');
        lines.push(' *');
        lines.push(` * Analyzed ${parsed.length} collection(s), found ${shared.length} shared operation(s).`);
        lines.push(' */');
        lines.push('');
        lines.push(`import type {IMeta} from '@feasibleone/blong';`);
        lines.push('');
        lines.push('/**');
        lines.push(' * Handler names shared across multiple collections.');
        lines.push(' * Import these into your suite and reference them from handler() destructuring.');
        lines.push(' */');
        lines.push('export const sharedHandlerNames = [');
        for (const [op, labels] of shared) {
            const [method, path] = op.split(' ');
            const handlerName = operationToHandlerName(method, path);
            lines.push(`    '${handlerName}', // ${op} — used in: ${labels.join(', ')}`);
        }
        lines.push('] as const;');
        lines.push('');
        lines.push('export type SharedHandlerName = (typeof sharedHandlerNames)[number];');
        lines.push('');
        lines.push('/**');
        lines.push(' * Type signature for shared handler functions.');
        lines.push(' */');
        lines.push('export type SharedHandler = (params: Record<string, unknown>, $meta: IMeta) => Promise<unknown>;');

        await mkdir(params.targetDir, {recursive: true});
        const helpersPath = join(params.targetDir, 'helpers.ts');
        await writeFile(helpersPath, lines.join('\n') + '\n', 'utf-8');

        console.log(`✓ Wrote ${helpersPath}`);
        console.log(`  ${shared.length} shared operations from ${parsed.length} collections`);

        return {
            collectionsAnalyzed: parsed.length,
            sharedOperations: shared.length,
            helpersPath,
            helpers: shared.map(([operation, labels]) => ({
                operation,
                handlerName: operationToHandlerName(operation.split(' ')[0], operation.split(' ')[1]),
                usedIn: labels,
            })),
        };
    },
}));
