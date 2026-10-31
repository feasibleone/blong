import type {IAgentStepRequest, IAgentStepResult} from '@feasibleone/blong/types';
import {handler} from '@feasibleone/blong/types';

/**
 * `engine.step.run` — one model turn (`@@D-708`).
 *
 * The work is the adapter's, because the SDK client is: this names the method and hands the request
 * over, so a realm sees one vocabulary whichever engine answers.
 */
export default handler(() => ({
    async engineStepRun(params: IAgentStepRequest, _$meta: unknown): Promise<IAgentStepResult> {
        const self = this as unknown as {
            engineStep: (request: IAgentStepRequest) => Promise<IAgentStepResult>;
        };
        return self.engineStep(params);
    },
}));
