/**
 * Analyze collection for duplication patterns
 */

import {handler} from '@feasibleone/blong';
import type {IMeta} from '@feasibleone/blong';
import {parseCollection} from '../../../lib/parser.js';
import {analyzeCollectionDuplication, calculateReductionPercentage} from '../../../lib/dedup.js';

export default handler(() => ({
    /**
     * Analyze a collection for duplication and suggest refactorings
     * 
     * @param params - Analysis parameters
     * @param $meta - Metadata
     */
    migrateMigrateCollectionAnalyze: async (
        params: {
            sourcePath: string;
        },
        $meta: IMeta,
    ) => {
        // Parse the collection
        const collection = await parseCollection(params.sourcePath);

        // Analyze for duplication
        const analysis = analyzeCollectionDuplication(collection);
        const reductionPct = calculateReductionPercentage(analysis);

        // Format output
        console.log(`\n=== Duplication Analysis: ${collection.name} ===`);
        console.log(`Total Requests: ${analysis.totalRequests}`);
        console.log(`Duplicated Request Patterns: ${analysis.duplicatedRequests}`);
        console.log(`Duplicated Assertion Patterns: ${analysis.duplicatedAssertions}`);
        console.log(`Duplicated Script Patterns: ${analysis.duplicatedScripts}`);
        console.log(`Potential Code Reduction: ~${reductionPct}%`);
        
        if (analysis.suggestions.length > 0) {
            console.log(`\n=== Top Duplication Patterns ===`);
            analysis.suggestions
                .sort((a, b) => b.occurrences - a.occurrences)
                .slice(0, 10)
                .forEach(s => {
                    console.log(`\n[${s.type.toUpperCase()}] ${s.pattern}`);
                    console.log(`  Occurrences: ${s.occurrences}`);
                    console.log(`  Locations: ${s.locations.slice(0, 3).join(', ')}...`);
                });
        }
        
        console.log(`\n=====================================\n`);

        return {
            collectionName: collection.name,
            analysis,
            reductionPercentage: reductionPct,
        };
    },
}));
