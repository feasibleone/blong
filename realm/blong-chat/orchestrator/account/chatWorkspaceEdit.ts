import {handler, type IMeta} from '@feasibleone/blong';

import {WORKSPACE_CREDENTIAL_FIELDS} from './chatWorkspaceFind.ts';

/**
 * `chat.workspace.edit` — the form's save, with the mask it echoed back removed.
 *
 * A workspace whose pair was replaced is written with the new pair; one whose name changed and whose
 * tokens were left alone must not have the mask written over them, or the next maintenance pass
 * renews with eight dots and the app stops being maintained (`@@T-625`).
 */
export default handler(({lib: {credentialPatchUnmasked, dispatchedValue}}) => ({
    async chatWorkspaceEdit(params: unknown, $meta: IMeta): Promise<unknown> {
        const port = this as unknown as {
            dispatch: (params: unknown, $meta: IMeta) => Promise<unknown>;
        };
        const call = params as {workspace?: Record<string, unknown>};
        const workspace = credentialPatchUnmasked(
            call.workspace ?? {},
            WORKSPACE_CREDENTIAL_FIELDS,
        ) as Record<string, unknown>;
        const answer = await port.dispatch(
            {
                ...call,
                workspace: {...workspace, updatedAt: new Date().toISOString()},
            },
            {...$meta, method: 'db/chat.workspace.edit', mtid: 'request'},
        );
        return dispatchedValue(answer);
    },
}));
