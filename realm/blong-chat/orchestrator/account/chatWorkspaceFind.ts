import {handler, type IMeta} from '@feasibleone/blong';

/** The columns of a workspace that are secrets: the configuration-token pair. */
export const WORKSPACE_CREDENTIAL_FIELDS = ['configToken', 'configRefreshToken'] as const;

/**
 * `chat.workspace.find` — the workspace page's list, with its configuration pair replaced.
 *
 * One pair of these tokens authorizes app management for every bot in the workspace, so a table of
 * workspaces is the most valuable table this realm holds — and the least interesting to read: the page
 * needs to know a pair exists, not what it is (`@@T-625`).
 */
export default handler(({lib: {credentialPageMasked, dispatchedValue}}) => ({
    async chatWorkspaceFind(params: unknown, $meta: IMeta): Promise<unknown> {
        const port = this as unknown as {
            dispatch: (params: unknown, $meta: IMeta) => Promise<unknown>;
        };
        const answer = await port.dispatch(params, {
            ...$meta,
            method: 'db/chat.workspace.find',
            mtid: 'request',
        });
        return credentialPageMasked(dispatchedValue(answer), WORKSPACE_CREDENTIAL_FIELDS);
    },
}));
