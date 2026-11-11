import type {IMeta} from '@feasibleone/blong';
import {handler} from '@feasibleone/blong';

/**
 * `chat.credential.persist` — write back what a port learned about one account.
 *
 * The alias is the whole address: it is the key a caller names the account by and the unique half of
 * the row's index, so a rotation does not have to carry an id back through a map it never saw. Only
 * the fields the caller names are written, which is what makes a token renewal a two-column update
 * rather than a full rewrite of credentials it did not touch (`@@D-797`).
 */
export default handler(({lib: {chatAccountColumns}}) => ({
    async chatCredentialPersist(
        params: {platform?: string; alias?: string} & Record<string, unknown>,
        _$meta: IMeta,
    ): Promise<{updated: boolean}> {
        const qb = this.config?.context?.queryBuilder;
        if (!qb) throw new Error('Database not available');
        const platform = params.platform ?? 'slack';
        const alias = params.alias;
        if (!alias) throw new Error('An account alias is required');
        const columns = chatAccountColumns(params) as Record<string, unknown>;
        if (!Object.keys(columns).length) return {updated: false};
        const updated = await qb('chat_account')
            .where('platform', platform)
            .where('accountAlias', alias)
            .update({...columns, updatedAt: new Date()});
        return {updated: Boolean(updated)};
    },
}));
