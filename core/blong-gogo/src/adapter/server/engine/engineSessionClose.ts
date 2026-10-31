import {handler} from '@feasibleone/blong/types';

/**
 * `engine.session.close` — release what the account holds.
 *
 * Called in `finally`, so a failed session never leaves a scripted cursor or a harness subprocess
 * behind (`@@D-708`).
 */
export default handler(() => ({
    async engineSessionClose(
        params: {account: string; workspacePath?: string},
        _$meta: unknown,
    ): Promise<{closed: boolean}> {
        const self = this as unknown as {
            engineClose: (request: {account: string; workspacePath?: string}) => Promise<{
                closed: boolean;
            }>;
        };
        return self.engineClose(params);
    },
}));
