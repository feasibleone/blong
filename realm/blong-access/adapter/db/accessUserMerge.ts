import {type IMeta, handler} from '@feasibleone/blong';

import * as account from './account.ts';

type KnexQb = any;

/**
 * `access.user.merge` — attach (or update) the `access_user` profile of an
 * EXISTING resource.
 *
 * `access.user.add` always ensures a NEW `access.user`-typed resource, so it
 * cannot describe a subject whose resource already exists as something else —
 * a unit or an organization acting as a service account.  This merge binds the
 * profile to the resource the caller names, which is what makes such a subject
 * able to authenticate (`access.credential.checkClient` resolves it by its
 * `clientId`) and to authorize through the same `hasRole` / `hasScope` paths as
 * any other subject.
 *
 * Idempotent: an existing profile keeps every field the call does not name, so
 * re-running a seed neither clears a client id nor flips `isActive`.  A client
 * id already held by a different subject is refused rather than reassigned.
 *
 * Wire: `access.user.merge` — called by a realm's seed (through `super`), never
 * by the generic CRUD, which owns its own resource lifecycle.
 */
export default handler(({errors}) => ({
    async accessUserMerge(
        params: {
            user?: Array<{
                /** Existing resource the profile belongs to. */
                resourceName: string;
                /** Its type alias — the name is resolved within the type. */
                typeAlias: string;
                /** OAuth client id the subject authenticates with (`clientSecret` grant). */
                clientId?: string;
                emailAddress?: string | null;
                isActive?: boolean;
            }>;
        },
        $meta: IMeta,
    ): Promise<{
        success: boolean;
        user: Array<{
            userId: string;
            resourceName: string;
            typeAlias: string;
            clientId: string | null;
        }>;
    }> {
        const qb: KnexQb = this.config?.context?.queryBuilder;
        if (!qb) throw new Error('Database not available');

        const merged: Array<{
            userId: string;
            resourceName: string;
            typeAlias: string;
            clientId: string | null;
        }> = [];

        for (const row of params.user ?? []) {
            const resource = (await qb
                .select('r.resourceId')
                .from('core_resource as r')
                .join('core_type as t', 't.typeId', 'r.typeId')
                .where('r.resourceName', row.resourceName)
                .where('t.typeAlias', row.typeAlias)
                .first()) as {resourceId: Buffer} | undefined;
            if (!resource) throw errors.userNotFound();

            if (row.clientId !== undefined) {
                const taken = await qb
                    .select('userId')
                    .from('access_user')
                    .where('clientId', row.clientId)
                    .whereNot('userId', resource.resourceId)
                    .first();
                if (taken) throw errors.userClientIdTaken({clientId: row.clientId});
            }

            const patch: Record<string, unknown> = {};
            if (row.emailAddress !== undefined) patch.emailAddress = row.emailAddress;
            if (row.clientId !== undefined) patch.clientId = row.clientId;
            if (row.isActive !== undefined) patch.isActive = row.isActive ? 1 : 0;

            const insert = {
                userId: resource.resourceId,
                emailAddress: row.emailAddress ?? null,
                clientId: row.clientId ?? null,
                isActive: row.isActive === undefined ? 1 : row.isActive ? 1 : 0,
            };
            await (Object.keys(patch).length
                ? qb('access_user').insert(insert).onConflict('userId').merge(patch)
                : qb('access_user').insert(insert).onConflict('userId').ignore());

            merged.push({
                userId: account.bufToUuid(resource.resourceId),
                resourceName: row.resourceName,
                typeAlias: row.typeAlias,
                clientId: row.clientId ?? null,
            });
        }

        return {success: true, user: merged};
    },
}));
