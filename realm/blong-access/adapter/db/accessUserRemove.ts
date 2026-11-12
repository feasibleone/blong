import {type IMeta} from '@feasibleone/blong';

import {handler} from './handlerGroup.ts';

type KnexQb = any;

/**
 * `access.user.remove` — delete a user and everything that references it.
 *
 * The user is named either way a caller may have it: `userId` when the id was read from
 * a form or a token, `userName` — the login, which is what a list of accounts shows and
 * what a person removing a handful of them knows. The name is resolved to its
 * `core_resource` row inside the transaction, so a concurrent rename cannot slip between
 * the lookup and the delete, and a name nobody holds is refused rather than answered
 * `success` (`@@D-649`).
 *
 * Everything that points at the user goes with it: the graph edges in both directions
 * (the user's `hasRole`, and membership edges that name the user as their object), its
 * record-level ACL rules, the session rows, the credential rows, the `access_user` row and
 * finally the `core_resource` row. The paths are rebuilt once, before the resource row is
 * deleted, because `core_path` holds a foreign key to it. Deleting the rows and leaving an
 * edge or an ACL rule behind would leave a principal id no reader can name.
 *
 * The sessions go before the credentials, not after: `access_session.credentialId` is a
 * foreign key into `access_credential`, so a user who is signed in — the one an operator
 * removes last, having just used it — refuses the delete if the credentials are removed
 * first (`@@F-713`).
 */
export default handler(({lib: {binHex, resourceIdByName}, errors: {errorUserNotFound}}) => ({
    async accessUserRemove(
        params: {userId?: string; userName?: string},
        $meta: IMeta,
    ): Promise<{success: boolean; userId: string; userName?: string}> {
        const qb: KnexQb = this.config?.context?.queryBuilder;
        if (!qb) throw new Error('Database not available');
        const hex = binHex(params.userId);
        const name = params.userName?.trim();
        // A missing id used to answer `success` while removing nothing — a caller
        // that passed the id under another key (this handler takes a flat
        // `{userId}`, not the `{user: {userId}}` of add/edit) saw a clean result
        // and the user stayed. @@D-649
        if (!hex && !name) throw new Error('access.user.remove requires a userId or a userName');

        const removed = await qb.transaction(async (trx: KnexQb) => {
            const resolved = hex ?? binHex(await resourceIdByName(trx, name!, 'access.user'));
            if (!resolved) throw errorUserNotFound({params: {userName: name}}, $meta);
            const buf = Buffer.from(resolved, 'hex');

            const edges =
                (await trx('core_triple').where('subjectId', buf).del()) +
                (await trx('core_triple').where('objectId', buf).del());
            await trx('access_acl').where('principalId', buf).del();
            await trx('access_session').where('userId', buf).del();
            await trx('access_credential').where('userId', buf).del();
            await trx('access_user').where('userId', buf).del();
            if (edges > 0) await trx.raw('CALL access_pathRefresh()');
            await trx('core_resource').where('resourceId', buf).del();
            return resolved;
        });

        return {
            success: true,
            userId: Buffer.from(removed, 'hex').toString('base64'),
            ...(name ? {userName: name} : {}),
        };
    },
}));
