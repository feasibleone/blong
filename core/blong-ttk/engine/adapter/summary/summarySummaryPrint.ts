/**
 * Print test execution summary to console
 */

import {handler} from '@feasibleone/blong';
import type {IMeta} from '@feasibleone/blong';

export default handler(() => ({
    /**
     * Print a formatted test execution summary
     * 
     * @param results - Test execution results
     * @param $meta - Metadata
     */
    summarySummaryPrint: (
        results: {
            totalTests: number;
            passed: number;
            failed: number;
            skipped: number;
            duration: number;
            outputDir?: string;
        },
        $meta: IMeta,
    ) => {
        console.log('\n=== Test Execution Summary ===');
        console.log(`Total Tests:  ${results.totalTests}`);
        console.log(`Passed:       ${results.passed} ✓`);
        console.log(`Failed:       ${results.failed} ${results.failed > 0 ? '✗' : ''}`);
        console.log(`Skipped:      ${results.skipped}`);
        console.log(`Duration:     ${(results.duration / 1000).toFixed(2)}s`);
        
        if (results.outputDir) {
            console.log(`\nAllure results: ${results.outputDir}`);
            console.log(`Generate report: allure generate ${results.outputDir} -o allure-report --clean`);
        }
        
        console.log('===============================\n');

        return {success: true};
    },
}));
