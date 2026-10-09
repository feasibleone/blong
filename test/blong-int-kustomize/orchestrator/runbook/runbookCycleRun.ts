import {handler, type IMeta} from '@feasibleone/blong';

import type {ICycleOptions} from './runbookMachinePrepare.ts';
import type {IRunbookReport} from './runbookSuiteDeploy.ts';

/**
 * runbook.cycle.run — the developer's cycle: the machine half, then the runbook.
 *
 * One command and two handlers, and the second is reached through the proxy rather than imported,
 * because that is what keeps a step a step: a handler that called another's library directly would be
 * a call the framework cannot route, mock or count. The seam between them is the artifact URLs the
 * machine half leaves in the environment, which the runbook's tree generation reads.
 */
export default handler(({handler: {runbookMachinePrepare, runbookSuiteDeploy}}) => ({
    async runbookCycleRun(
        params: Partial<ICycleOptions>,
        $meta: IMeta,
    ): Promise<IRunbookReport[]> {
        // Both halves read their own defaults from the environment, so a CLI flag is an override
        // rather than the only way in — which is what lets the same command serve CI.
        const prepared = (await runbookMachinePrepare(params, $meta)) as IRunbookReport;
        const deployed = (await runbookSuiteDeploy(params, $meta)) as IRunbookReport;
        return [prepared, deployed];
    },
}));