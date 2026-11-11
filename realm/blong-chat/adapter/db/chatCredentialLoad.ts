import type {IMeta} from '@feasibleone/blong';
import {handler} from '@feasibleone/blong';
import type {IChatAccount, IChatAccountMap, IChatWorkspace} from '@feasibleone/blong/types';

/**
 * `chat.credential.load` — every account the port may serve, keyed by the alias it addresses them by.
 *
 * A disabled row keeps its credentials and is left out, which is what makes switching an account off
 * a decision rather than a deletion. Each account carries the configuration-token pair of the
 * workspace it names, resolved here so the port reads one shape; the workspace alias travels with it
 * so a rotation is written back to that row (`@@D-797`). The realm's `chat.credential.list` is the method
 * a port reaches; this one holds the query, where `queryBuilder` is in scope (`@@F-663`).
 */
export default handler(({lib: {chatAccountOfRow, chatWorkspaceOfRow}, errors}) => ({
    async chatCredentialLoad(
        params: {platform?: string; includeDisabled?: boolean},
        _$meta: IMeta,
    ): Promise<{accounts: IChatAccountMap}> {
        const qb = this.config?.context?.queryBuilder;
        // An absent query builder is a store that is not there, and answering it as an empty map
        // would read as a deployment that keeps its accounts in configuration — the case a port
        // falls back to. The difference is the whole answer when an account was added and not
        // served, so this one says why instead.
        if (!qb) throw errors['chat.storeUnavailable']({reason: 'the database is not ready'});
        const query = qb('chat_account').select('*');
        if (params.platform) query.where('platform', params.platform);
        if (!params.includeDisabled) query.where('accountStatus', 'enabled');
        const [rows, workspaceRows] = (await Promise.all([
            query,
            qb('chat_workspace').where('workspaceStatus', 'enabled').select('*'),
        ])) as [Array<Record<string, unknown>>, Array<Record<string, unknown>>];
        const workspaces = new Map<string, IChatWorkspace>();
        for (const row of workspaceRows) {
            const name = row.workspaceName;
            if (typeof name === 'string' && name) workspaces.set(name, chatWorkspaceOfRow(row));
        }
        const accounts: IChatAccountMap = {};
        for (const row of rows) {
            const alias = row.accountAlias;
            if (typeof alias !== 'string' || !alias) continue;
            const account = chatAccountOfRow(row) as IChatAccount;
            const credential = account.workspace
                ? (workspaces.get(account.workspace) as IChatWorkspace | undefined)
                : undefined;
            accounts[alias] = credential ? {...account, ...credential} : account;
        }
        return {accounts};
    },
}));
