import {randomUUID} from 'node:crypto';

import {handler, type IMeta} from '@feasibleone/blong';

/**
 * `chat.workspace.add` — a new workspace, with the identity the row needs.
 *
 * The same two server-managed values an account needs: the `'uuid'` marker that makes the adapter
 * generate the `binary(16)` key on a table that is not resource-backed, and the timestamps a form
 * never sends (`@@T-625`).
 */
export default handler(({lib: {dispatchedValue}}) => ({
    async chatWorkspaceAdd(params: unknown, $meta: IMeta): Promise<unknown> {
        const port = this as unknown as {
            dispatch: (params: unknown, $meta: IMeta) => Promise<unknown>;
        };
        const call = params as {workspace?: Record<string, unknown>};
        const now = new Date().toISOString();
        const answer = await port.dispatch(
            {
                ...call,
                workspace: {
                    workspaceId: randomUUID(),
                    createdAt: now,
                    updatedAt: now,
                    ...call.workspace,
                },
            },
            {...$meta, method: 'db/chat.workspace.add', mtid: 'request'},
        );
        return dispatchedValue(answer);
    },
}));
