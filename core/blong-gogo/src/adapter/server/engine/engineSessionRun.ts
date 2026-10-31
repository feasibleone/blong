import type {IAgentSessionRequest, IAgentSessionResult} from '@feasibleone/blong/types';
import {handler} from '@feasibleone/blong/types';

/** `engine.session.run` — one native run, for an engine that owns its loop (`@@D-711`). */
export default handler(() => ({
    async engineSessionRun(
        params: IAgentSessionRequest,
        _$meta: unknown,
    ): Promise<IAgentSessionResult> {
        const self = this as unknown as {
            engineSession: (request: IAgentSessionRequest) => Promise<IAgentSessionResult>;
        };
        return self.engineSession(params);
    },
}));
