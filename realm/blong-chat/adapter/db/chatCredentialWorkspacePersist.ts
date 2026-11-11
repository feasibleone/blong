import type {IMeta} from '@feasibleone/blong';
import {handler} from '@feasibleone/blong';

/**
 * `chat.credential.workspacePersist` — write back the configuration-token pair Slack answered.
 *
 * The workspace is the address, because the pair authorizes app management in that workspace and
 * serves every account of it: a rotation is one row, however many bots the row maintains
 * (`@@D-797`). Only the fields the caller names are written, so a renewal never touches a pair it
 * did not replace.
 */
export default handler(({lib: {chatWorkspaceColumns}}) => ({
    async chatCredentialWorkspacePersist(
        params: {platform?: string; workspace?: string} & Record<string, unknown>,
        _$meta: IMeta,
    ): Promise<{updated: boolean}> {
        const qb = this.config?.context?.queryBuilder;
        if (!qb) throw new Error('Database not available');
        const platform = params.platform ?? 'slack';
        const workspace = params.workspace;
        if (!workspace) throw new Error('A workspace name is required');
        const columns = chatWorkspaceColumns(params) as Record<string, unknown>;
        if (!Object.keys(columns).length) return {updated: false};
        const updated = await qb('chat_workspace')
            .where('platform', platform)
            .where('workspaceName', workspace)
            .update({...columns, updatedAt: new Date()});
        return {updated: Boolean(updated)};
    },
}));
