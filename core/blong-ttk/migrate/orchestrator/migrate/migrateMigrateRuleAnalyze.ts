/**
 * Analyze ml-testing-toolkit rule files
 */

import {handler} from '@feasibleone/blong';
import {readFile, readdir} from 'node:fs/promises';
import {join} from 'node:path';
import type {IMeta} from '@feasibleone/blong';

export default handler(() => ({
    /**
     * Analyze ml-testing-toolkit rule JSON files
     * 
     * Summarizes rule types, event types, and complexity
     * 
     * @param params - Analysis parameters
     * @param $meta - Metadata
     */
    migrateMigrateRuleAnalyze: async (
        params: {
            rulesDir: string;
        },
        $meta: IMeta,
    ) => {
        const ruleFiles = await readdir(params.rulesDir);
        const jsonFiles = ruleFiles.filter(f => f.endsWith('.json'));

        const summary = {
            totalFiles: jsonFiles.length,
            totalRules: 0,
            eventTypes: new Map<string, number>(),
            priorities: [] as number[],
        };

        for (const file of jsonFiles) {
            const filepath = join(params.rulesDir, file);
            const content = await readFile(filepath, 'utf-8');
            const rules = JSON.parse(content);

            if (Array.isArray(rules)) {
                summary.totalRules += rules.length;

                for (const rule of rules) {
                    // Count event types
                    if (rule.event?.type) {
                        const count = summary.eventTypes.get(rule.event.type) || 0;
                        summary.eventTypes.set(rule.event.type, count + 1);
                    }

                    // Collect priorities
                    if (rule.priority !== undefined) {
                        summary.priorities.push(rule.priority);
                    }
                }
            }
        }

        // Format output
        console.log(`\n=== Rule Analysis: ${params.rulesDir} ===`);
        console.log(`Total Files: ${summary.totalFiles}`);
        console.log(`Total Rules: ${summary.totalRules}`);
        console.log(`\nEvent Types:`);
        for (const [type, count] of summary.eventTypes.entries()) {
            console.log(`  ${type}: ${count}`);
        }
        console.log(`\n=====================================\n`);

        return {
            totalFiles: summary.totalFiles,
            totalRules: summary.totalRules,
            eventTypes: Object.fromEntries(summary.eventTypes),
        };
    },
}));
