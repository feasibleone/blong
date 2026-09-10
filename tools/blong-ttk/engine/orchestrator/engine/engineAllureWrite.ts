/**
 * Manually trigger Allure result writing
 */

import {handler} from '@feasibleone/blong';
import {allureResultWrite} from '@feasibleone/blong-allure';
import type {IMeta, IStepProgress} from '@feasibleone/blong-chain';

export default handler(() => ({
    /**
     * Write Allure results for a step or collection
     *
     * @param params - Step progress and context
     * @param $meta - Metadata
     */
    engineAllureWrite: async (
        params: {
            step: IStepProgress;
            realm?: string;
            collection?: string;
            group?: string;
            outputDir?: string;
            logUrl?: string;
        },
        $meta: IMeta,
    ) => {
        const outputDir = params.outputDir || 'allure-results';
        const context = {
            realm: params.realm || 'ttk',
            collection: params.collection,
            group: params.group,
            logUrl: params.logUrl || 'http://localhost:9998/trace/{traceId}',
        };

        await allureResultWrite(outputDir, params.step, context, $meta);

        return {success: true};
    },
}));
