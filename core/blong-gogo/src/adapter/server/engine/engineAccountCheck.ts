import {handler} from '@feasibleone/blong/types';

/**
 * `engine.account.check` — whether this process can answer for an account, and in which mode.
 *
 * A deployment asks before it claims a ticket, so a missing engine package is a decision at the pool
 * rather than a failure halfway through a session (`@@D-700`).
 */
export default handler(() => ({
    async engineAccountCheck(
        params: {account: string},
        _$meta: unknown,
    ): Promise<{reachable: boolean; kind: string; mode: string}> {
        const self = this as unknown as {
            engineCheck: (request: {account: string}) => Promise<{
                reachable: boolean;
                kind: string;
                mode: string;
            }>;
        };
        return self.engineCheck(params);
    },
}));
