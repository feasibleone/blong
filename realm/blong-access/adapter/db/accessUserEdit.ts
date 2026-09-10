import {type IMeta, handler} from '@feasibleone/blong';

import * as model from './accessModel.ts';

type KnexQb = any;

/**
 * `access.user.edit` — update a user's columns plus its credential rows and
 * granted roles.
 *
 * The standard `access_user` update runs through the automatic knex CRUD
 * (`super.exec`). Credential rows are then synced (only when the form actually
 * submitted a `credential` array — otherwise they are left untouched), and the
 * `hasRole` edges are brought in line with the submitted `role` array.
 */
export default handler(
    ({
        handler: {'db/coreTripleMerge': coreTripleMerge},
        lib: {hashPassword, credentialPolicyParams},
    }) => ({
        async accessUserEdit(
            params: {
                user?: {userId?: string; emailAddress?: string; isActive?: boolean};
                credential?: Array<Record<string, unknown>>;
                role?: Array<{roleId?: string; roleName?: string; granted?: boolean}>;
            },
            $meta: IMeta,
        ): Promise<unknown> {
            const qb: KnexQb = this.config?.context?.queryBuilder;
            if (!qb) throw new Error('Database not available');
            const result = await super.exec(params, $meta);
            const hex = model.binHex(params.user?.userId);
            if (!hex) throw new Error('Invalid user id');
            if (Array.isArray(params.credential)) {
                await model.syncCredentials(
                    qb,
                    {hashPassword, credentialPolicyParams},
                    hex,
                    params.credential,
                );
            }
            if (Array.isArray(params.role)) {
                const roleIds = (params.role ?? [])
                    .filter(r => r.granted !== false)
                    .map(r => model.binHex(r.roleId))
                    .filter((x): x is string => !!x);
                await model.syncEdges(qb, coreTripleMerge, hex, 'hasRole', roleIds, $meta);
            }
            return result;
        },
    }),
);
